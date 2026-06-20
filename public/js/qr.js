import { t } from "./i18n.js";

let scanner = null;
let videoEl = null;
let scanning = false;

function parseQr(text) {
  const m = text.match(/^TRA:(\d+):([A-Za-z0-9]+)$/i);
  if (!m) return null;
  return { stationId: m[1], zone: m[2].toUpperCase() };
}

export async function startQrScan(containerEl, onSuccess, onError) {
  if (scanning) return;
  scanning = true;
  containerEl.classList.remove("hidden");

  if ("BarcodeDetector" in window) {
    try {
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      videoEl = document.createElement("video");
      videoEl.setAttribute("playsinline", "true");
      containerEl.innerHTML = "";
      containerEl.appendChild(videoEl);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      videoEl.srcObject = stream;
      await videoEl.play();

      const tick = async () => {
        if (!scanning) return;
        try {
          const codes = await detector.detect(videoEl);
          if (codes.length) {
            const parsed = parseQr(codes[0].rawValue);
            if (parsed) {
              stopQrScan(containerEl);
              onSuccess(parsed);
              return;
            }
            onError?.(t("qrFail"));
          }
        } catch {
          /* ignore frame errors */
        }
        requestAnimationFrame(tick);
      };
      tick();
      return;
    } catch (err) {
      console.warn("BarcodeDetector failed, trying html5-qrcode", err);
    }
  }

  if (!window.Html5Qrcode) {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
    document.head.appendChild(script);
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = reject;
    });
  }

  containerEl.innerHTML = '<div id="qrReader" style="width:100%"></div>';
  scanner = new Html5Qrcode("qrReader");
  await scanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decoded) => {
      const parsed = parseQr(decoded);
      if (parsed) {
        stopQrScan(containerEl);
        onSuccess(parsed);
      }
    },
    () => {}
  );
}

export async function stopQrScan(containerEl) {
  scanning = false;
  if (videoEl?.srcObject) {
    videoEl.srcObject.getTracks().forEach((tr) => tr.stop());
    videoEl = null;
  }
  if (scanner) {
    try {
      await scanner.stop();
      scanner.clear();
    } catch {
      /* ignore */
    }
    scanner = null;
  }
  containerEl.classList.add("hidden");
  containerEl.innerHTML = "";
}

export function showLocationBadge(zone) {
  let badge = document.getElementById("locationBadge");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "locationBadge";
    badge.className = "location-badge";
    document.querySelector("main").prepend(badge);
  }
  badge.textContent = t("currentLocation", { zone });
  badge.classList.add("show");
}
