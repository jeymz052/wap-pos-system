import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { coerceBarcodeFormat, type BarcodeKind, type BarcodeLabelConfig } from "./barcode-utils";

export type RenderedBarcodeAsset =
  | { mode: "svg"; markup: string }
  | { mode: "image"; dataUrl: string };

export async function renderBarcodeAsset(input: {
  value: string;
  barcodeType: BarcodeKind;
  barcodeFormat: BarcodeLabelConfig["barcodeFormat"];
}) {
  if (input.barcodeType === "qr_code") {
    const dataUrl = await QRCode.toDataURL(input.value, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 180,
      color: {
        dark: "#111827",
        light: "#ffffff",
      },
    });

    return { mode: "image", dataUrl } satisfies RenderedBarcodeAsset;
  }

  const svgNode = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const format = coerceBarcodeFormat(input.barcodeFormat, input.value);

  JsBarcode(svgNode, input.value, {
    format,
    displayValue: false,
    margin: 0,
    background: "#ffffff",
    lineColor: "#111827",
    width: 2,
    height: 56,
  });

  svgNode.setAttribute("preserveAspectRatio", "none");
  svgNode.setAttribute("width", "100%");
  svgNode.setAttribute("height", "100%");

  return { mode: "svg", markup: svgNode.outerHTML } satisfies RenderedBarcodeAsset;
}
