declare module "qrcode" {
  type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";

  type ToDataUrlOptions = {
    errorCorrectionLevel?: ErrorCorrectionLevel;
    margin?: number;
    width?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  };

  const QRCode: {
    toDataURL(text: string, options?: ToDataUrlOptions): Promise<string>;
  };

  export default QRCode;
}
