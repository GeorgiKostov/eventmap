// Applies to every /admin/* route. robots.txt already disallows /admin/, but
// that only stops crawling — a link into an admin page from elsewhere (an
// email, a shared screenshot) could still get indexed without this meta tag.
// Before this file, only the Thursday desk had it; Highlights had neither.
export const metadata = {
  title: 'Okolo admin',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }) {
  return children;
}
