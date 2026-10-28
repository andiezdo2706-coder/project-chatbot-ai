import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Giới thiệu đồ án của Đỗ Đình Duy",
  description: "Chatbot hỏi đáp tài liệu chạy trên AWS (Amplify, API Gateway, Lambda, Bedrock)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
