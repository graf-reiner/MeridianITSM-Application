import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { StackScreenProps } from '@react-navigation/stack';
import { TicketsStackParamList } from '../../navigation/types';
import { useCreateTicket, useCategories } from '../../api/tickets';
import { useAuthStore } from '../../stores/auth.store';

type Props = StackScreenProps<TicketsStackParamList, 'CreateTicket'>;

const createTicketSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().min(1, 'Description is required'),
  type: z.enum(['INCIDENT', 'SERVICE_REQUEST', 'PROBLEM']),
  priority: z.enum(['P1', 'P2', 'P3', 'P4']),
  categoryId: z.string().optional(),
});

type CreateTicketForm = z.infer<typeof createTicketSchema>;

const TICKET_TYPES: Array<{ value: string; label: string }> = [
  { value: 'INCIDENT', label: 'Incident' },
  { value: 'SERVICE_REQUEST', label: 'Service Request' },
  { value: 'PROBLEM', label: 'Problem' },
];

const PRIORITIES: Array<{ value: string; label: string; color: string }> = [
  { value: 'P1', label: 'P1 — Critical', color: '#dc2626' },
  { value: 'P2', label: 'P2 — High', color: '#f59e0b' },
  { value: 'P3', label: 'P3 — Medium', color: '#3b82f6' },
  { value: 'P4', label: 'P4 — Low', color: '#6b7280' },
];

interface PickerModalProps {
  visible: boolean;
  title: string;
  options: Array<{ value: string; label: string; color?: string }>;
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

function PickerModal({ visible, title, options, selected, onSelect, onClose }: PickerModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableOpacity style={styles.modalOverlay} onPress={onClose} activeOpacity={1}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>{title}</Text>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.modalOption, selected === opt.value && styles.modalOptionActive]}
              onPress={() => { onSelect(opt.value); onClose(); }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.modalOptionText,
                  opt.color ? { color: opt.color } : {},
                  selected === opt.value && { fontWeight: '700' },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export function CreateTicketScreen({ navigation }: Props) {
  const { tenantBranding } = useAuthStore();
  const accentColor = tenantBranding?.accentColor ?? '#4f46e5';
  const createTicket = useCreateTicket();
  const { data: categoriesData } = useCategories();
  const categories = categoriesData ?? [];

  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<CreateTicketForm>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      title: '',
      description: '',
      type: 'INCIDENT',
      priority: 'P3',
      categoryId: undefined,
    },
  });

  const typeValue = watch('type');
  const priorityValue = watch('priority');
  const categoryValue = watch('categoryId');

  const onSubmit = (formData: CreateTicketForm) => {
    createTicket.mutate(formData, {
      onSuccess: (ticket) => {
        navigation.replace('TicketDetail', { id: ticket.id });
      },
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>New Ticket</Text>

        {/* Title */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Title *</Text>
          <Controller
            control={control}
            name="title"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={[styles.input, errors.title && styles.inputError]}
                value={value}
                onChangeText={onChange}
                placeholder="Brief description of the issue"
                placeholderTextColor="#9ca3af"
                returnKeyType="next"
                maxLength={200}
              />
            )}
          />
          {errors.title && <Text style={styles.fieldError}>{errors.title.message}</Text>}
        </View>

        {/* Description */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Description *</Text>
          <Controller
            control={control}
            name="description"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={[styles.input, styles.textArea, errors.description && styles.inputError]}
                value={value}
                onChangeText={onChange}
                placeholder="Provide details about the issue..."
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
            )}
          />
          {errors.description && <Text style={styles.fieldError}>{errors.description.message}</Text>}
        </View>

        {/* Type picker */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Type</Text>
          <Controller
            control={control}
            name="type"
            render={({ field: { onChange } }) => (
              <>
                <TouchableOpacity
                  style={styles.pickerButton}
                  onPress={() => setShowTypePicker(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.pickerButtonText}>
                    {TICKET_TYPES.find((t) => t.value === typeValue)?.label ?? 'Select type'}
                  </Text>
                  <Text style={styles.pickerChevron}>›</Text>
                </TouchableOpacity>
                <PickerModal
                  visible={showTypePicker}
                  title="Select Type"
                  options={TICKET_TYPES}
                  selected={typeValue}
                  onSelect={onChange}
                  onClose={() => setShowTypePicker(false)}
                />
              </>
            )}
          />
        </View>

        {/* Priority picker */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Priority</Text>
          <Controller
            control={control}
            name="priority"
            render={({ field: { onChange } }) => (
              <>
                <TouchableOpacity
                  style={styles.pickerButton}
                  onPress={() => setShowPriorityPicker(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.pickerButtonText}>
                    {PRIORITIES.find((p) => p.value === priorityValue)?.label ?? 'Select priority'}
                  </Text>
                  <Text style={styles.pickerChevron}>›</Text>
                </TouchableOpacity>
                <PickerModal
                  visible={showPriorityPicker}
                  title="Select Priority"
                  options={PRIORITIES}
                  selected={priorityValue}
                  onSelect={onChange}
                  onClose={() => setShowPriorityPicker(false)}
                />
              </>
            )}
          />
        </View>

        {/* Category picker (optional) */}
        {categories.length > 0 && (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Category (optional)</Text>
            <Controller
              control={control}
              name="categoryId"
              render={({ field: { onChange } }) => (
                <>
                  <TouchableOpacity
                    style={styles.pickerButton}
                    onPress={() => setShowCategoryPicker(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.pickerButtonText}>
                      {categories.find((c) => c.id === categoryValue)?.name ?? 'Select category'}
                    </Text>
                    <Text style={styles.pickerChevron}>›</Text>
                  </TouchableOpacity>
                  <PickerModal
                    visible={showCategoryPicker}
                    title="Select Category"
                    options={[
                      { value: '', label: 'None' },
                      ...categories.map((c) => ({ value: c.id, label: c.name })),
                    ]}
                    selected={categoryValue ?? ''}
                    onSelect={(val) => onChange(val || undefined)}
                    onClose={() => setShowCategoryPicker(false)}
                  />
                </>
              )}
            />
          </View>
        )}

        {createTicket.isError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>Failed to create ticket. Please try again.</Text>
          </View>
        )}

        {/* Submit button */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            { backgroundColor: accentColor },
            createTicket.isPending && styles.submitButtonDisabled,
          ]}
          onPress={() => void handleSubmit(onSubmit)()}
          disabled={createTicket.isPending}
          activeOpacity={0.8}
        >
          {createTicket.isPending ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.submitButtonText}>Create Ticket</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 24,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    height: 44,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    fontSize: 16,
    color: '#374151',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  textArea: {
    height: 100,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: '#dc2626',
  },
  fieldError: {
    fontSize: 13,
    color: '#dc2626',
    marginTop: 4,
  },
  pickerButton: {
    height: 44,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerButtonText: {
    fontSize: 16,
    color: '#374151',
  },
  pickerChevron: {
    fontSize: 20,
    color: '#9ca3af',
  },
  errorBanner: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    fontSize: 14,
    color: '#991b1b',
  },
  submitButton: {
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalOption: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  modalOptionActive: {
    backgroundColor: '#f0f0ff',
  },
  modalOptionText: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
  },
});
