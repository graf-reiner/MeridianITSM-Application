import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  ActionSheetIOS,
  Alert,
  Platform,
  StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export interface PhotoItem {
  uri: string;
  width: number;
  height: number;
  type: string;
  name: string;
}

interface PhotoPickerProps {
  photos: PhotoItem[];
  onPhotosChange: (photos: PhotoItem[]) => void;
  maxPhotos?: number;
}

const MAX_WIDTH = 1920;
const JPEG_QUALITY = 0.7;
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

async function compressPhoto(uri: string): Promise<PhotoItem | null> {
  try {
    // First resize to max width
    const compressed = await manipulateAsync(
      uri,
      [{ resize: { width: MAX_WIDTH } }],
      { compress: JPEG_QUALITY, format: SaveFormat.JPEG }
    );

    // Verify size < 2MB by fetching as blob
    const response = await fetch(compressed.uri);
    const blob = await response.blob();
    if (blob.size > MAX_SIZE_BYTES) {
      // Try more aggressive compression
      const recompressed = await manipulateAsync(
        compressed.uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.5, format: SaveFormat.JPEG }
      );
      return {
        uri: recompressed.uri,
        width: recompressed.width,
        height: recompressed.height,
        type: 'image/jpeg',
        name: `photo-${Date.now()}.jpg`,
      };
    }

    return {
      uri: compressed.uri,
      width: compressed.width,
      height: compressed.height,
      type: 'image/jpeg',
      name: `photo-${Date.now()}.jpg`,
    };
  } catch {
    return null;
  }
}

async function requestCameraPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  return status === 'granted';
}

async function requestLibraryPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
}

export function PhotoPicker({ photos, onPhotosChange, maxPhotos = 5 }: PhotoPickerProps) {
  const [loading, setLoading] = useState(false);

  const handleAddPhoto = () => {
    if (photos.length >= maxPhotos) {
      Alert.alert('Limit reached', `You can attach up to ${maxPhotos} photos per comment.`);
      return;
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        async (buttonIndex) => {
          if (buttonIndex === 1) await takePhoto();
          if (buttonIndex === 2) await pickFromLibrary();
        }
      );
    } else {
      Alert.alert('Add Photo', 'Choose an option', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take Photo', onPress: () => void takePhoto() },
        { text: 'Choose from Library', onPress: () => void pickFromLibrary() },
      ]);
    }
  };

  const takePhoto = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      Alert.alert('Permission required', 'Camera permission is needed to take photos.');
      return;
    }

    setLoading(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        const photo = await compressPhoto(result.assets[0].uri);
        if (photo) {
          onPhotosChange([...photos, photo]);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const pickFromLibrary = async () => {
    const hasPermission = await requestLibraryPermission();
    if (!hasPermission) {
      Alert.alert('Permission required', 'Photo library permission is needed to attach photos.');
      return;
    }

    setLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
        allowsMultipleSelection: photos.length < maxPhotos,
        selectionLimit: maxPhotos - photos.length,
      });

      if (!result.canceled) {
        const newPhotos: PhotoItem[] = [];
        for (const asset of result.assets) {
          const photo = await compressPhoto(asset.uri);
          if (photo) newPhotos.push(photo);
        }
        onPhotosChange([...photos, ...newPhotos].slice(0, maxPhotos));
      }
    } finally {
      setLoading(false);
    }
  };

  const removePhoto = (index: number) => {
    const updated = photos.filter((_, i) => i !== index);
    onPhotosChange(updated);
  };

  return (
    <View>
      {photos.length > 0 && (
        <FlatList
          data={photos}
          keyExtractor={(_, index) => String(index)}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.thumbnailList}
          renderItem={({ item, index }) => (
            <View style={styles.thumbnailWrapper}>
              <Image source={{ uri: item.uri }} style={styles.thumbnail} />
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removePhoto(index)}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Text style={styles.removeIcon}>×</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
      <TouchableOpacity
        style={[styles.addButton, loading && styles.addButtonDisabled]}
        onPress={handleAddPhoto}
        disabled={loading || photos.length >= maxPhotos}
        activeOpacity={0.7}
      >
        <Text style={styles.addButtonText}>
          {loading ? 'Processing...' : 'Add Photo'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  thumbnailList: {
    marginBottom: 8,
  },
  thumbnailWrapper: {
    marginRight: 8,
    position: 'relative',
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: 6,
    backgroundColor: '#e5e7eb',
  },
  removeButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeIcon: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  addButton: {
    height: 44,
    paddingHorizontal: 16,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignSelf: 'flex-start',
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
});
