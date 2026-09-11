(() => {
  try {
    const savedTheme = localStorage.getItem('forge-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle(
      'dark',
      savedTheme ? savedTheme === 'dark' : prefersDark,
    );
  } catch {
    document.documentElement.classList.add('dark');
  }
})();
