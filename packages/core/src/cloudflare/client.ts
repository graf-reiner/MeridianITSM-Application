import type {
  CreateDnsRecordInput,
  DnsRecordSummary,
  TunnelConfiguration,
  TunnelConfigurationEnvelope,
  TunnelInfo,
  VerifyTokenResult,
  ZoneSummary,
} from './types.js';

export interface CloudflareClientOptions {
  apiToken: string;
  accountId: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class CloudflareApiError extends Error {
  readonly statusCode: number;
  readonly errors: Array<{ code: number; message: string }>;

  constructor(message: string, statusCode: number, errors: Array<{ code: number; message: string }>) {
    super(message);
    this.name = 'CloudflareApiError';
    this.statusCode = statusCode;
    this.errors = errors;
  }

  /**
   * True if Cloudflare reported any of the given error codes.
   * Code reference: https://developers.cloudflare.com/api/error-codes/
   */
  hasCode(code: number): boolean {
    return this.errors.some((e) => e.code === code);
  }
}

/**
 * Thin wrapper over Cloudflare's REST API. Handles Bearer auth, response
 * envelope unwrapping, and error normalisation. All methods return the
 * inner `result` value so callers don't repeat the success/errors dance.
 */
export class CloudflareClient {
  private readonly apiToken: string;
  private readonly accountId: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: CloudflareClientOptions) {
    this.apiToken = opts.apiToken;
    this.accountId = opts.accountId;
    this.baseUrl = opts.baseUrl ?? 'https://api.cloudflare.com/client/v4';
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      throw new CloudflareApiError(
        `Cloudflare returned non-JSON response (HTTP ${res.status})`,
        res.status,
        [],
      );
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new CloudflareApiError(`Cloudflare returned malformed response`, res.status, []);
    }
    const envelope = parsed as { success?: boolean; result?: T; errors?: Array<{ code: number; message: string }> };

    if (!envelope.success) {
      const errors = Array.isArray(envelope.errors) ? envelope.errors : [];
      const summary = errors.length > 0 ? errors.map((e) => `[${e.code}] ${e.message}`).join('; ') : `HTTP ${res.status}`;
      throw new CloudflareApiError(`Cloudflare API error: ${summary}`, res.status, errors);
    }

    return envelope.result as T;
  }

  // ── Tokens ──────────────────────────────────────────────────────────────

  /** GET /user/tokens/verify — confirms the token is valid and active. */
  async verifyToken(): Promise<VerifyTokenResult> {
    return this.request<VerifyTokenResult>('GET', '/user/tokens/verify');
  }

  // ── Zones ───────────────────────────────────────────────────────────────

  /** GET /zones?name=<apex> — returns the zone matching the given apex, or null. */
  async findZoneByName(apex: string): Promise<ZoneSummary | null> {
    const result = await this.request<ZoneSummary[]>(
      'GET',
      `/zones?name=${encodeURIComponent(apex)}&status=active`,
    );
    return result?.[0] ?? null;
  }

  /**
   * GET /zones — returns every zone the API token has access to (active only),
   * paginated. Used by the owner-admin Provision form to populate the Domain
   * dropdown live from the operator's Cloudflare account.
   */
  async listZones(): Promise<ZoneSummary[]> {
    const all: ZoneSummary[] = [];
    let page = 1;
    const perPage = 50;
    while (true) {
      const batch = await this.request<ZoneSummary[]>(
        'GET',
        `/zones?status=active&per_page=${perPage}&page=${page}`,
      );
      if (!batch || batch.length === 0) break;
      all.push(...batch);
      if (batch.length < perPage) break;
      page += 1;
      // Safety cap — Cloudflare accounts >500 zones are uncommon and the
      // dropdown experience would be unusable anyway.
      if (page > 10) break;
    }
    return all;
  }

  // ── Tunnel configuration ────────────────────────────────────────────────

  /** GET /accounts/:account/cfd_tunnel/:tunnel/configurations */
  async getTunnelConfiguration(tunnelId: string): Promise<TunnelConfigurationEnvelope> {
    return this.request<TunnelConfigurationEnvelope>(
      'GET',
      `/accounts/${this.accountId}/cfd_tunnel/${tunnelId}/configurations`,
    );
  }

  /** PUT /accounts/:account/cfd_tunnel/:tunnel/configurations */
  async putTunnelConfiguration(tunnelId: string, config: TunnelConfiguration): Promise<TunnelConfigurationEnvelope> {
    return this.request<TunnelConfigurationEnvelope>(
      'PUT',
      `/accounts/${this.accountId}/cfd_tunnel/${tunnelId}/configurations`,
      { config },
    );
  }

  /** GET /accounts/:account/cfd_tunnel/:tunnel — tunnel metadata for UI display. */
  async getTunnel(tunnelId: string): Promise<TunnelInfo> {
    return this.request<TunnelInfo>(
      'GET',
      `/accounts/${this.accountId}/cfd_tunnel/${tunnelId}`,
    );
  }

  // ── DNS records ────────────────────────────────────────────────────────

  /** GET /zones/:zone/dns_records?name=&type= */
  async listDnsRecords(zoneId: string, params: { name?: string; type?: string } = {}): Promise<DnsRecordSummary[]> {
    const qs = new URLSearchParams();
    if (params.name) qs.set('name', params.name);
    if (params.type) qs.set('type', params.type);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return this.request<DnsRecordSummary[]>('GET', `/zones/${zoneId}/dns_records${suffix}`);
  }

  /** POST /zones/:zone/dns_records */
  async createDnsRecord(zoneId: string, record: CreateDnsRecordInput): Promise<DnsRecordSummary> {
    return this.request<DnsRecordSummary>('POST', `/zones/${zoneId}/dns_records`, record);
  }

  /** DELETE /zones/:zone/dns_records/:id */
  async deleteDnsRecord(zoneId: string, recordId: string): Promise<void> {
    await this.request<{ id: string }>('DELETE', `/zones/${zoneId}/dns_records/${recordId}`);
  }
}
