declare module '*tailwind.config.js' {
  const config: {
    theme: {
      extend: {
        colors: Record<string, string>;
      };
    };
  };
  export default config;
}
