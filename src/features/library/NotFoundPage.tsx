import { useTranslation } from 'react-i18next';
import { MissingNode } from './parts';

/** Un indirizzo che non corrisponde a nessuna pagina. */
export function NotFoundPage() {
  const { t } = useTranslation();
  return <MissingNode message={t('errors.pageMissing')} workspaceId={null} />;
}
