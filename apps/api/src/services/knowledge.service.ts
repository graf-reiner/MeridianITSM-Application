import { prisma } from '@meridian/db';

// ─── Types ────────────────────────────────────────────────────────────────────

type PrismaTransaction = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface CreateArticleData {
  title: string;
  summary?: string;
  content: string;
  tags?: string[];
  visibility?: 'PUBLIC' | 'INTERNAL';
  isKnownError?: boolean;
}

export interface UpdateArticleData {
  title?: string;
  summary?: string;
  content?: string;
  tags?: string[];
  visibility?: 'PUBLIC' | 'INTERNAL';
  status?: 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'RETIRED';
  isKnownError?: boolean;
}

export interface ArticleListFilters {
  status?: string;
  visibility?: string;
  search?: string;
  tags?: string[];
  authorId?: string;
  knownError?: boolean;
  page?: number;
  pageSize?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Allowed status transitions for knowledge articles.
 * DRAFT -> IN_REVIEW -> PUBLISHED -> RETIRED (with some backtracking).
 */
const ARTICLE_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['IN_REVIEW', 'PUBLISHED'],
  IN_REVIEW: ['PUBLISHED', 'DRAFT'],
  PUBLISHED: ['RETIRED', 'DRAFT'],
  RETIRED: ['DRAFT'],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generates the next sequential article number for a tenant.
 * Uses advisory lock to prevent race conditions under concurrent creation.
 */
async function getNextArticleNumber(
  tenantId: string,
  tx: PrismaTransaction,
): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId} || '_kb_seq'))`;
  const result = await tx.$queryRaw<[{ next: number }]>`
    SELECT COALESCE(MAX("articleNumber"), 0) + 1 AS next
    FROM knowledge_articles WHERE "tenantId" = ${tenantId}::uuid`;
  return Number(result[0].next);
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Creates a new knowledge article with a sequential article number.
 */
export async function createArticle(
  tenantId: string,
  data: CreateArticleData,
  authorId: string,
) {
  return prisma.$transaction(async (tx) => {
    const articleNumber = await getNextArticleNumber(tenantId, tx);

    return tx.knowledgeArticle.create({
      data: {
        tenantId,
        articleNumber,
        title: data.title,
        summary: data.summary,
        content: data.content,
        tags: data.tags ?? [],
        visibility: data.visibility ?? 'INTERNAL',
        status: 'DRAFT',
        isKnownError: data.isKnownError ?? false,
        authorId,
      },
    });
  });
}

/**
 * Updates an existing knowledge article.
 * Validates status transitions if a status change is requested.
 * Sets publishedAt when transitioning to PUBLISHED for the first time.
 */
export async function updateArticle(
  tenantId: string,
  articleId: string,
  data: UpdateArticleData,
  _actorId: string,
) {
  const existing = await prisma.knowledgeArticle.findFirst({
    where: { id: articleId, tenantId },
  });

  if (!existing) {
    return null;
  }

  const updateData: {
    title?: string;
    summary?: string | null;
    content?: string;
    tags?: string[];
    visibility?: 'PUBLIC' | 'INTERNAL';
    status?: 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'RETIRED';
    publishedAt?: Date;
    isKnownError?: boolean;
  } = {};

  if (data.title !== undefined) updateData.title = data.title;
  if (data.summary !== undefined) updateData.summary = data.summary;
  if (data.content !== undefined) updateData.content = data.content;
  if (data.tags !== undefined) updateData.tags = data.tags;
  if (data.visibility !== undefined) updateData.visibility = data.visibility;
  if (data.isKnownError !== undefined) updateData.isKnownError = data.isKnownError;

  if (data.status !== undefined) {
    const currentStatus = existing.status as string;
    const allowed = ARTICLE_TRANSITIONS[currentStatus] ?? [];

    if (!allowed.includes(data.status)) {
      throw new Error(
        `Invalid status transition: ${currentStatus} -> ${data.status}. Allowed: ${allowed.join(', ')}`,
      );
    }

    updateData.status = data.status;

    // Set publishedAt on first publish
    if (data.status === 'PUBLISHED' && !existing.publishedAt) {
      updateData.publishedAt = new Date();
    }
  }

  return prisma.knowledgeArticle.update({
    where: { id: articleId, tenantId },
    data: updateData,
  });
}

/**
 * Returns a paginated list of knowledge articles for staff (all statuses).
 */
export async function getArticleList(
  tenantId: string,
  filters: ArticleListFilters,
) {
  const {
    status,
    visibility,
    search,
    tags,
    authorId,
    knownError,
    page = 1,
    pageSize = 20,
  } = filters;

  type ArticleStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'RETIRED';
  type ArticleVisibility = 'PUBLIC' | 'INTERNAL';

  const where: {
    tenantId: string;
    status?: ArticleStatus;
    visibility?: ArticleVisibility;
    authorId?: string;
    isKnownError?: boolean;
    OR?: Array<{
      title?: { contains: string; mode: 'insensitive' };
      summary?: { contains: string; mode: 'insensitive' };
      tags?: { has: string };
    }>;
    tags?: { hasEvery: string[] };
  } = { tenantId };

  if (status) where.status = status as ArticleStatus;
  if (visibility) where.visibility = visibility as ArticleVisibility;
  if (authorId) where.authorId = authorId;
  if (knownError !== undefined) where.isKnownError = knownError;

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { summary: { contains: search, mode: 'insensitive' } },
      { tags: { has: search } },
    ];
  }

  if (tags && tags.length > 0) {
    where.tags = { hasEvery: tags };
  }

  const skip = (page - 1) * pageSize;

  const [data, total] = await Promise.all([
    prisma.knowledgeArticle.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: { author: { select: { firstName: true, lastName: true } } },
    }),
    prisma.knowledgeArticle.count({ where }),
  ]);

  return { data, total };
}

/**
 * Returns the detail for a single article and increments the view count.
 * Returns null if not found.
 */
export async function getArticleDetail(tenantId: string, articleId: string) {
  const article = await prisma.knowledgeArticle.findFirst({
    where: { id: articleId, tenantId },
  });

  if (!article) {
    return null;
  }

  // Increment viewCount asynchronously — don't block the response
  void prisma.knowledgeArticle.update({
    where: { id: articleId, tenantId },
    data: { viewCount: { increment: 1 } },
  });

  return article;
}

/**
 * Votes on an article — helpful increments helpfulCount, not helpful decrements (floor 0).
 */
export async function voteArticle(
  tenantId: string,
  articleId: string,
  helpful: boolean,
) {
  const existing = await prisma.knowledgeArticle.findFirst({
    where: { id: articleId, tenantId },
  });

  if (!existing) {
    return null;
  }

  let updated;

  if (helpful) {
    updated = await prisma.knowledgeArticle.update({
      where: { id: articleId, tenantId },
      data: { helpfulCount: { increment: 1 } },
    });
  } else {
    // Decrement but do not go below 0
    const newCount = Math.max(0, existing.helpfulCount - 1);
    updated = await prisma.knowledgeArticle.update({
      where: { id: articleId, tenantId },
      data: { helpfulCount: newCount },
    });
  }

  return updated.helpfulCount;
}

/**
 * Returns paginated PUBLISHED + PUBLIC articles for the end-user portal.
 */
export async function getPublishedArticles(
  tenantId: string,
  filters: Omit<ArticleListFilters, 'status' | 'visibility' | 'authorId'>,
) {
  const { search, tags, page = 1, pageSize = 20 } = filters;

  const where: {
    tenantId: string;
    status: 'PUBLISHED';
    visibility: 'PUBLIC';
    OR?: Array<{
      title?: { contains: string; mode: 'insensitive' };
      summary?: { contains: string; mode: 'insensitive' };
      tags?: { has: string };
    }>;
    tags?: { hasEvery: string[] };
  } = {
    tenantId,
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
  };

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { summary: { contains: search, mode: 'insensitive' } },
      { tags: { has: search } },
    ];
  }

  if (tags && tags.length > 0) {
    where.tags = { hasEvery: tags };
  }

  const skip = (page - 1) * pageSize;

  const [data, total] = await Promise.all([
    prisma.knowledgeArticle.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.knowledgeArticle.count({ where }),
  ]);

  return { data, total };
}

/**
 * Deletes a knowledge article. Returns null if not found.
 */
export async function deleteArticle(tenantId: string, articleId: string) {
  const existing = await prisma.knowledgeArticle.findFirst({
    where: { id: articleId, tenantId },
  });

  if (!existing) {
    return null;
  }

  return prisma.knowledgeArticle.delete({
    where: { id: articleId, tenantId },
  });
}
