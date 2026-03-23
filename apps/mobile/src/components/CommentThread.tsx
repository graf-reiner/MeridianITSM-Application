import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { TicketComment, useAddComment } from '../api/tickets';
import { PhotoPicker, PhotoItem } from './PhotoPicker';

interface CommentThreadProps {
  ticketId: string;
  comments: TicketComment[];
  canPostInternal?: boolean;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

interface CommentItemProps {
  comment: TicketComment;
  isPending?: boolean;
}

function CommentItem({ comment, isPending = false }: CommentItemProps) {
  return (
    <View style={[styles.commentItem, isPending && styles.commentPending]}>
      <View style={styles.commentHeader}>
        <View style={styles.commentAuthorRow}>
          <Text style={styles.commentAuthor}>{comment.author.name}</Text>
          <View
            style={[
              styles.visibilityBadge,
              comment.visibility === 'INTERNAL'
                ? styles.visibilityInternal
                : styles.visibilityPublic,
            ]}
          >
            <Text style={styles.visibilityText}>
              {comment.visibility === 'INTERNAL' ? 'Internal' : 'Public'}
            </Text>
          </View>
        </View>
        <Text style={styles.commentTime}>
          {isPending ? 'Sending...' : formatRelativeTime(comment.createdAt)}
        </Text>
      </View>
      <Text style={styles.commentBody}>{comment.body}</Text>
      {comment.attachments && comment.attachments.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.attachmentList}>
          {comment.attachments.map((att) => (
            <Image
              key={att.id}
              source={{ uri: att.url }}
              style={styles.attachmentThumbnail}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export function CommentThread({ ticketId, comments, canPostInternal = false }: CommentThreadProps) {
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'INTERNAL'>('PUBLIC');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const addComment = useAddComment();

  const handleSubmit = () => {
    if (!body.trim()) return;

    addComment.mutate(
      {
        ticketId,
        body: body.trim(),
        visibility,
        photos: photos.map((p) => ({ uri: p.uri, type: p.type, name: p.name })),
      },
      {
        onSuccess: () => {
          setBody('');
          setPhotos([]);
          setVisibility('PUBLIC');
        },
      }
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <View style={styles.container}>
        <Text style={styles.sectionHeader}>Comments ({comments.length})</Text>

        {comments.length === 0 && (
          <Text style={styles.emptyText}>No comments yet. Be the first to add one.</Text>
        )}

        <FlatList
          data={comments}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => <CommentItem comment={item} />}
          scrollEnabled={false}
        />

        {/* Input area */}
        <View style={styles.inputContainer}>
          {canPostInternal && (
            <View style={styles.visibilityToggle}>
              <TouchableOpacity
                style={[
                  styles.visibilityOption,
                  visibility === 'PUBLIC' && styles.visibilityOptionActive,
                ]}
                onPress={() => setVisibility('PUBLIC')}
              >
                <Text
                  style={[
                    styles.visibilityOptionText,
                    visibility === 'PUBLIC' && styles.visibilityOptionTextActive,
                  ]}
                >
                  Public
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.visibilityOption,
                  visibility === 'INTERNAL' && styles.visibilityOptionActive,
                ]}
                onPress={() => setVisibility('INTERNAL')}
              >
                <Text
                  style={[
                    styles.visibilityOptionText,
                    visibility === 'INTERNAL' && styles.visibilityOptionTextActive,
                  ]}
                >
                  Internal
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <TextInput
            style={styles.textInput}
            value={body}
            onChangeText={setBody}
            placeholder="Add a comment..."
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <PhotoPicker photos={photos} onPhotosChange={setPhotos} />

          <View style={styles.submitRow}>
            <TouchableOpacity
              style={[
                styles.submitButton,
                (!body.trim() || addComment.isPending) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!body.trim() || addComment.isPending}
              activeOpacity={0.7}
            >
              <Text style={styles.submitButtonText}>
                {addComment.isPending ? 'Posting...' : 'Post Comment'}
              </Text>
            </TouchableOpacity>
          </View>

          {addComment.isError && (
            <Text style={styles.errorText}>Failed to post comment. Tap to retry.</Text>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 12,
    marginHorizontal: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    marginHorizontal: 16,
    marginBottom: 16,
  },
  commentItem: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  commentPending: {
    opacity: 0.6,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  commentAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  visibilityBadge: {
    borderRadius: 9999,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  visibilityPublic: {
    backgroundColor: '#d1fae5',
  },
  visibilityInternal: {
    backgroundColor: '#fef3c7',
  },
  visibilityText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
  },
  commentTime: {
    fontSize: 12,
    color: '#9ca3af',
  },
  commentBody: {
    fontSize: 16,
    color: '#374151',
    lineHeight: 24,
  },
  attachmentList: {
    marginTop: 8,
  },
  attachmentThumbnail: {
    width: 72,
    height: 72,
    borderRadius: 6,
    marginRight: 8,
    backgroundColor: '#e5e7eb',
  },
  inputContainer: {
    marginTop: 16,
    marginHorizontal: 16,
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 12,
  },
  visibilityToggle: {
    flexDirection: 'row',
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignSelf: 'flex-start',
  },
  visibilityOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f9fafb',
  },
  visibilityOptionActive: {
    backgroundColor: '#4f46e5',
  },
  visibilityOptionText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#6b7280',
  },
  visibilityOptionTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  textInput: {
    height: 80,
    fontSize: 16,
    color: '#374151',
    padding: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    backgroundColor: '#f9fafb',
  },
  submitRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  submitButton: {
    height: 44,
    paddingHorizontal: 20,
    backgroundColor: '#4f46e5',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  errorText: {
    fontSize: 13,
    color: '#dc2626',
  },
});
