import React from "react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center">
      <span className="text-6xl">🔍</span>
      <h1 className="font-serif text-2xl font-bold text-cream-800">페이지를 찾을 수 없습니다</h1>
      <a href="/" className="text-cream-600 underline hover:text-cream-800 text-sm">
        홈으로 돌아가기
      </a>
    </div>
  );
}
