import { OrganizationList } from '@clerk/nextjs';

export default async function OrgSelectionPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const { redirect_url } = await searchParams;

  // Open-redirect guard: allow only valid same-origin paths
  const safeRedirect =
    redirect_url && redirect_url.startsWith('/') && !redirect_url.startsWith('//')
      ? redirect_url
      : '/dashboard';

  return (
    <OrganizationList
      hidePersonal
      afterSelectOrganizationUrl={safeRedirect}
      afterCreateOrganizationUrl="/onboarding"
    />
  );
}