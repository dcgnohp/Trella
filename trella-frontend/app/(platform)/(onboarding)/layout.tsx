const OnboardingLayout = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  // Full-screen flow — intentionally no AppNavbar / sidebar chrome.
  // Providers (Auth/Query/Toaster) come from the parent (platform) layout.
  return <div style={{ minHeight: '100vh' }}>{children}</div>;
};

export default OnboardingLayout;
