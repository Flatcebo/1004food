import type {NextConfig} from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "xn--hy1b07t6sj80h.com",
        pathname: "/img/**",
      },
    ],
  },
};

export default nextConfig;
