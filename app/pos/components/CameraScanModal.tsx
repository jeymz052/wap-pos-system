"use client";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Camera, CheckCircle2, X } from "lucide-react";

type Props = {
  onClose: () => void;
  onDetected: (code: string) => void;
};

type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

export default function CameraScanModal({ onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let detector: BarcodeDetectorLike | null = null;
    let intervalId: number | null = null;
    let cancelled = false;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        if (window.BarcodeDetector) {
          detector = new window.BarcodeDetector({
            formats: ["qr_code", "code_128", "ean_13", "ean_8", "upc_a", "upc_e"],
          });

          intervalId = window.setInterval(async () => {
            if (!detector || !videoRef.current) return;
            const results = await detector.detect(videoRef.current);
            const code = results.find((result) => result.rawValue)?.rawValue?.trim();
            if (code) {
              onDetected(code);
              onClose();
            }
          }, 500);
        } else {
          setError("This browser does not support BarcodeDetector. Use manual/USB scan in the search box.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to access the camera.");
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onClose, onDetected]);

  return (
    <div className="pos-modal-overlay" onClick={onClose}>
      <div className="pos-modal pos-modal--payment" onClick={(e) => e.stopPropagation()}>
        <div className="pos-modal__head">
          <div className="pos-modal__title-wrap">
            <Camera size={18} />
            <h2 className="pos-modal__title">Scan Barcode or QR Code</h2>
          </div>
          <button className="pos-modal__close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="pos-payment-body">
          <video ref={videoRef} style={{ width: "100%", borderRadius: 14, background: "#0f172a" }} muted playsInline />
          <p className="pos-pay-warning">Point the camera at the product barcode or QR code. Detection runs automatically.</p>
          {error ? (
            <div className="pos-pay-error">
              <AlertCircle size={15} /> {error}
            </div>
          ) : (
            <div className="pos-pay-warning">
              <CheckCircle2 size={15} /> Waiting for barcode...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
