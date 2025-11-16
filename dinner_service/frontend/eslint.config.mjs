import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
    // 현재 개발 단계에서는 타입/문자 관련 엄격한 룰 때문에 작업이 막히지 않도록 완화
    rules: {
      // 프로덕션 코드에서는 any를 줄이는 게 좋지만, 지금은 빌드/개발 편의상 허용
      "@typescript-eslint/no-explicit-any": "off",
      // 한글 문장 안의 따옴표 때문에 불필요하게 오류가 나는 룰 비활성화
      "react/no-unescaped-entities": "off",
      // Next 이미지 최적화는 나중에 적용하고, 현재는 <img> 사용 허용
      "@next/next/no-img-element": "off",
    },
  },
];

export default eslintConfig;
