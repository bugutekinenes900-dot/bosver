import plugin from "tailwindcss/plugin";

/**
 * Stitch export'undaki Material 3 token seti birebir korunur. Acik tema
 * degerleri kaynaktaki hex'lerin aynisidir; koyu tema ayni isimlere karsilik
 * gelen M3 dark tonlarini kullanir. Renkler CSS degiskenine baglandigi icin
 * `bg-surface/80` gibi opaklik modifiyecileri calismaya devam eder.
 */
const light = {
  "on-primary": "#ffffff",
  "on-secondary-fixed-variant": "#004493",
  tertiary: "#802b00",
  "tertiary-fixed": "#ffdbce",
  "secondary-fixed": "#d8e2ff",
  "tertiary-fixed-dim": "#ffb599",
  "surface-container-highest": "#e1e3e4",
  "primary-container": "#0b57d0",
  secondary: "#0058bb",
  "on-tertiary-fixed": "#370e00",
  "surface-dim": "#d9dadb",
  "secondary-fixed-dim": "#adc7ff",
  "surface-container-high": "#e7e8e9",
  "surface-container-lowest": "#ffffff",
  "inverse-surface": "#2e3132",
  "on-tertiary-container": "#ffcfbe",
  "primary-fixed-dim": "#b2c5ff",
  primary: "#0041a2",
  "on-secondary-fixed": "#001a41",
  "surface-container": "#edeeef",
  "on-primary-fixed": "#001847",
  "on-tertiary-fixed-variant": "#7f2b00",
  "outline-variant": "#c3c6d6",
  "on-error": "#ffffff",
  background: "#f8f9fa",
  surface: "#f8f9fa",
  "inverse-on-surface": "#f0f1f2",
  "on-secondary-container": "#fefcff",
  "surface-tint": "#0856cf",
  "on-error-container": "#93000a",
  "inverse-primary": "#b2c5ff",
  "surface-bright": "#f8f9fa",
  "on-background": "#191c1d",
  "on-primary-container": "#ced9ff",
  "on-primary-fixed-variant": "#0040a1",
  "on-surface": "#191c1d",
  "error-container": "#ffdad6",
  "surface-variant": "#e1e3e4",
  "on-secondary": "#ffffff",
  "primary-fixed": "#dae2ff",
  "tertiary-container": "#a83b00",
  "on-tertiary": "#ffffff",
  "surface-container-low": "#f3f4f5",
  "on-surface-variant": "#424654",
  "secondary-container": "#1471e6",
  outline: "#737785",
  error: "#ba1a1a",
};

const dark = {
  ...light,
  "on-primary": "#002a78",
  tertiary: "#ffb599",
  "surface-container-highest": "#333537",
  "primary-container": "#0842a0",
  secondary: "#adc7ff",
  "surface-dim": "#131314",
  "surface-container-high": "#282a2c",
  "surface-container-lowest": "#0e0e0e",
  "inverse-surface": "#e3e3e3",
  "on-tertiary-container": "#ffdbce",
  primary: "#b2c5ff",
  "surface-container": "#1e1f20",
  "outline-variant": "#444746",
  "on-error": "#690005",
  background: "#131314",
  surface: "#131314",
  "inverse-on-surface": "#2e3132",
  "on-secondary-container": "#d3e3fd",
  "surface-tint": "#a8c7fa",
  "on-error-container": "#ffdad6",
  "inverse-primary": "#0041a2",
  "surface-bright": "#37393b",
  "on-background": "#e3e3e3",
  "on-primary-container": "#d3e3fd",
  "on-surface": "#e3e3e3",
  "error-container": "#93000a",
  "surface-variant": "#444746",
  "on-secondary": "#002f68",
  "tertiary-container": "#7f2b00",
  "on-tertiary": "#5a1c00",
  "surface-container-low": "#1b1b1b",
  "on-surface-variant": "#c4c7c5",
  "secondary-container": "#0842a0",
  outline: "#8e918f",
  error: "#ffb4ab",
};

function channels(hex) {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const int = parseInt(full, 16);
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
}

const varName = (token) => `--m3-${token}`;

const cssVars = (palette) =>
  Object.fromEntries(
    Object.entries(palette).map(([token, hex]) => [varName(token), channels(hex)])
  );

const colors = Object.fromEntries(
  Object.keys(light).map((token) => [
    token,
    `rgb(var(${varName(token)}) / <alpha-value>)`,
  ])
);

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors,
      borderRadius: {
        DEFAULT: "1rem",
        // Stitch markup'i `rounded-tr-xs` kullaniyor ama v3'te `xs` yok;
        // sohbet balonunun kuyrugu olusabilsin diye ekleniyor.
        xs: "0.25rem",
        lg: "2rem",
        xl: "3rem",
        full: "9999px",
      },
      spacing: {
        gutter: "1.5rem",
        margin: "2rem",
        "space-lg": "1.5rem",
        "space-xl": "2.5rem",
        "space-xs": "0.25rem",
        "space-md": "1rem",
        "space-sm": "0.5rem",
      },
      fontFamily: {
        "headline-md": ["Plus Jakarta Sans"],
        "label-md": ["Inter"],
        "label-sm": ["Inter"],
        "headline-lg": ["Plus Jakarta Sans"],
        "body-md": ["Inter"],
        "body-sm": ["Inter"],
        "body-lg": ["Inter"],
        "headline-sm": ["Plus Jakarta Sans"],
      },
      fontSize: {
        "headline-md": [
          "24px",
          { lineHeight: "32px", letterSpacing: "-0.01em", fontWeight: "600" },
        ],
        "label-md": ["14px", { lineHeight: "20px", fontWeight: "500" }],
        "label-sm": ["12px", { lineHeight: "16px", fontWeight: "500" }],
        "headline-lg": [
          "32px",
          { lineHeight: "40px", letterSpacing: "-0.02em", fontWeight: "600" },
        ],
        "body-md": ["14px", { lineHeight: "20px", fontWeight: "400" }],
        "body-sm": ["12px", { lineHeight: "16px", fontWeight: "400" }],
        "body-lg": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "headline-sm": ["18px", { lineHeight: "24px", fontWeight: "500" }],
      },
      keyframes: {
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 220ms ease-out both",
        "fade-in": "fade-in 180ms ease-out both",
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ":root": { ...cssVars(light), colorScheme: "light" },
        ".dark": { ...cssVars(dark), colorScheme: "dark" },
      });
    }),
  ],
};
