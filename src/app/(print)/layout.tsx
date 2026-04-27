export default function PrintLayout({ children }: { children: React.ReactNode }) {
  // Tailwind v4 oklch() 색상은 html2canvas가 지원하지 않아 hex로 강제
  return (
    <div
      className="print-root min-h-screen"
      style={{ backgroundColor: "#fff", color: "#000" }}
    >
      {children}
    </div>
  );
}
