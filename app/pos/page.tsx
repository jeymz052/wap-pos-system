import TopBar from "@/components/TopBar";
import { ShoppingCart } from "lucide-react";

export default function POSPage() {
  return (
    <div className="page">
      <TopBar title="POS / Sales" subtitle="Scan barcode or search item to start a sale" />
      <div className="page-body">
        <div className="placeholder-card">
          <div className="placeholder-icon" style={{ background: "#dbeafe" }}>
            <ShoppingCart size={32} color="#1e88e5" />
          </div>
          <h2>Point of Sale</h2>
          <p>
            Fast barcode checkout with product search by name, SKU, barcode, brand, category, engine model, and motorcycle model.
          </p>
          <span className="badge badge--blue">🚧 Module Under Development</span>
          <div style={{ marginTop: 32, textAlign: "left", maxWidth: 480, margin: "32px auto 0" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#0b1f3a", marginBottom: 12 }}>Features included:</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
              {["Barcode scanning", "Cart management", "Multiple payment methods", "Split payment", "Hold & recall order",
                "Void transaction", "Print/email receipt", "Discount per item", "Customer credit payment", "Daily shift closing"
              ].map((f) => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#4a5568" }}>
                  <span style={{ color: "#22c55e", fontWeight: 700 }}>✓</span>{f}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}