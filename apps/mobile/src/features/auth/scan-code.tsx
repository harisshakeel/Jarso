import { type ChildSignInLink, childScanCopy, parseChildSignInLink } from "@jarso/core/family";
import { ScanQrCodeIcon } from "lucide-react-native";
import { useRef, useState } from "react";
import { Modal, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Text } from "@/components/ui";
import { useTokens } from "@/lib";
import { loadCamera } from "./camera";

type CameraModule = NonNullable<ReturnType<typeof loadCamera>>;

/** The camera over the whole screen until a Jarso code is read or Close is tapped. */
function Scanner({
  camera,
  onScanned,
  onClose,
}: {
  camera: CameraModule;
  onScanned: (details: ChildSignInLink) => void;
  onClose: () => void;
}) {
  const done = useRef(false);
  const [notJarso, setNotJarso] = useState(false);
  const { CameraView } = camera;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-black">
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={({ data }) => {
            if (done.current) return;
            // Only ever read as a sign-in link; the text itself is never logged or shown.
            const details = parseChildSignInLink(data);
            if (!details) {
              setNotJarso(true);
              return;
            }
            done.current = true;
            onScanned(details);
          }}
        />
        <View className="gap-3 bg-background p-6">
          <Text accessibilityLiveRegion="polite" className="text-center font-sans-bold">
            {notJarso ? childScanCopy.notJarso : childScanCopy.point}
          </Text>
          <Button
            variant="keycap-white"
            size="lg"
            accessibilityLabel={childScanCopy.close}
            onPress={onClose}
          >
            <Text>{childScanCopy.close}</Text>
          </Button>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function ScanButton({
  camera,
  onScanned,
}: {
  camera: CameraModule;
  onScanned: (details: ChildSignInLink) => void;
}) {
  const tokens = useTokens();
  const [permission, requestPermission] = camera.useCameraPermissions();
  const [open, setOpen] = useState(false);
  const [denied, setDenied] = useState(false);

  async function start() {
    setDenied(false);
    const granted = permission?.granted || (await requestPermission()).granted;
    if (granted) setOpen(true);
    else setDenied(true);
  }

  return (
    <View className="gap-2">
      <Button
        variant="keycap"
        size="lg"
        accessibilityLabel={childScanCopy.scan}
        accessibilityHint={childScanCopy.scanHint}
        onPress={() => void start()}
      >
        <ScanQrCodeIcon size={22} color={tokens["primary-foreground"]} />
        <Text>{childScanCopy.scan}</Text>
      </Button>
      <Text className="text-center text-muted-foreground">
        {denied ? childScanCopy.noCamera : childScanCopy.scanHint}
      </Text>
      {open ? (
        <Scanner
          camera={camera}
          onClose={() => setOpen(false)}
          onScanned={(details) => {
            setOpen(false);
            onScanned(details);
          }}
        />
      ) : null}
    </View>
  );
}

/**
 * "Scan the code": reads the parent's share-card QR and hands back the family code and nickname
 * (core `parseChildSignInLink`, strict; never a PIN). A denied camera says to type the code; a
 * build without the camera module shows nothing and the form is typed as before.
 */
export function ScanCode({ onScanned }: { onScanned: (details: ChildSignInLink) => void }) {
  const camera = loadCamera();
  if (!camera) return null;
  return <ScanButton camera={camera} onScanned={onScanned} />;
}
