/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // 1단계에는 ESLint 설정이 없다. 형식 검사는 tsc(typecheck)와 테스트로 한다.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
