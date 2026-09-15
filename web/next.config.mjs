/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // O app do entregador e a loja pública renderizam imagens vindas de
  // storage externo (Vercel Blob / Cloudinary / S3). Os domínios reais
  // entram aqui quando o Storage for plugado (ver src/lib/storage.ts).
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.public.blob.vercel-storage.com' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
  },
  eslint: {
    // O build não deve falhar por regra de lint: a validação de tipos é
    // feita por `npm run typecheck`, separadamente.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
