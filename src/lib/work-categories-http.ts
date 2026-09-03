import { formErrorRedirect } from './http';

export function workCategoriesAdminRedirect(saved = false): Response {
  const location = saved ? '/admin?workCategoriesSaved=1#work-items' : '/admin#work-items';
  return new Response(null, {
    status: 303,
    headers: { Location: location },
  });
}

export function workCategoriesAdminError(message: string): Response {
  return formErrorRedirect('/admin', message, 'workCategoriesError');
}
