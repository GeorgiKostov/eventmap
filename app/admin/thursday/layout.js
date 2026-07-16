// robots noindex now comes from app/admin/layout.js — this file only still
// exists to override the tab title.
export const metadata = {
  title: 'Thursday — Okolo admin',
};

export default function AdminLayout({ children }) {
  return children;
}
