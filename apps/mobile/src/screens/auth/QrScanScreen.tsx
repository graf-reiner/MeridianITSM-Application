import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Dimensions,
} from 'react-native';
import { BarCodeScanner, BarCodeScannerResult } from 'expo-barcode-scanner';
import { StackNavigationProp } from '@react-navigation/stack';
import { AuthStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../stores/auth.store';

type QrScanScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'QrScan'>;

interface QrScanScreenProps {
  navigation: QrScanScreenNavigationProp;
}

interface QrPayload {
  serverUrl: string;
  tenantId?: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const FRAME_SIZE = SCREEN_WIDTH * 0.65;
const CORNER_SIZE = 64;
const CORNER_THICKNESS = 3;

export function QrScanScreen({ navigation }: QrScanScreenProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const { setServerUrl } = useAuthStore();

  useEffect(() => {
    const requestPermission = async () => {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    };
    void requestPermission();
  }, []);

  const handleBarCodeScanned = async ({ data }: BarCodeScannerResult) => {
    if (scanned) return;
    setScanned(true);

    try {
      let serverUrl: string;

      // Try parsing as JSON payload first
      try {
        const payload = JSON.parse(data) as QrPayload;
        if (!payload.serverUrl) throw new Error('Invalid QR payload');
        serverUrl = payload.serverUrl;
      } catch {
        // Fallback: treat the raw data as a URL
        if (!data.startsWith('http://') && !data.startsWith('https://')) {
          Alert.alert(
            'Invalid QR Code',
            'This QR code does not contain a valid MeridianITSM server URL.',
            [{ text: 'OK', onPress: () => setScanned(false) }],
          );
          return;
        }
        serverUrl = data;
      }

      await setServerUrl(serverUrl);
      navigation.navigate('Login');
    } catch {
      Alert.alert('Scan Error', 'Failed to process QR code. Please try again.', [
        { text: 'OK', onPress: () => setScanned(false) },
      ]);
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.statusText}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.statusText}>Camera access is required to scan QR codes.</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BarCodeScanner
        onBarCodeScanned={handleBarCodeScanned}
        style={StyleSheet.absoluteFillObject}
        barCodeTypes={[BarCodeScanner.Constants.BarCodeType.qr]}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top bar with cancel */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {/* Scan frame */}
        <View style={styles.frameContainer}>
          <View style={[styles.frame, { width: FRAME_SIZE, height: FRAME_SIZE }]}>
            {/* Corner marks */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
        </View>

        {/* Bottom instructions */}
        <View style={styles.bottomBar}>
          <Text style={styles.instructionText}>
            Point at the QR code from Settings &gt; Agents in MeridianITSM.
          </Text>

          <TouchableOpacity
            style={styles.manualButton}
            onPress={() => navigation.navigate('ManualServer')}
            activeOpacity={0.8}
          >
            <Text style={styles.manualButtonText}>Enter address manually</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const cornerStyle = {
  position: 'absolute' as const,
  width: CORNER_SIZE,
  height: CORNER_SIZE,
  borderColor: '#ffffff',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#000000',
  },
  statusText: {
    color: '#ffffff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    height: 44,
    paddingHorizontal: 24,
    backgroundColor: '#4f46e5',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    paddingTop: 56,
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  frameContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    position: 'relative',
  },
  corner: {
    ...cornerStyle,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
  },
  bottomBar: {
    padding: 24,
    alignItems: 'center',
    gap: 16,
  },
  instructionText: {
    color: '#ffffff',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  manualButton: {
    paddingVertical: 8,
  },
  manualButtonText: {
    color: '#a5b4fc',
    fontSize: 14,
    fontWeight: '500',
  },
});
