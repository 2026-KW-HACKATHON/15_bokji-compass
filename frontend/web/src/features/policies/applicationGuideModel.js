import { ApiError } from '../../shared/api/httpClient.js';
import { safeWebUrl } from '../../../../packages/core/src/safeUrl.js';

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value);
const text = (value) => typeof value === 'string';
const invalid = () =>
  new ApiError('신청 안내 정보의 형식을 확인하지 못했어요.', 'invalid_response');

export function safeTelephoneUrl(value) {
  if (typeof value !== 'string' || value.length > 40 || !/^\+?[0-9() -]+$/.test(value)) return null;
  const digits = value.replace(/[() -]/g, '');
  return /^(?:0[1-9]\d{7,9}|1\d{2,3}|1[568]\d{6}|\+[1-9]\d{7,14})$/.test(digits)
    ? `tel:${digits}`
    : null;
}

function destinationIdentity(value) {
  const url = new URL(value);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_.+|fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  }
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  url.searchParams.sort();
  return url.href;
}

function applicationDestination(value, sourceUrl) {
  const url = safeWebUrl(value);
  if (!url) return null;
  const source = safeWebUrl(sourceUrl);
  if (source && destinationIdentity(url) === destinationIdentity(source)) return null;
  const parsed = new URL(url);
  const path = parsed.pathname.replace(/\/+$/, '').toLowerCase();
  if (
    /(?:^|\/)(?:index|home|main|default|login)(?:\.(?:html?|php|aspx?|jsp|do))?$/.test(path) ||
    (!path && !/(?:apply|application|service)/i.test(parsed.hash))
  )
    return null;
  if (
    /(?:^|\/)(?:notices?|news|board|information|svcdtl|service-detail|contact|inquiry|help)(?:\/|\.|$)|(?:selec|select)(?:syst|system|service)info|wlfareinfo|\/rcvfvrsvc\/dtlex/.test(
      path,
    )
  )
    return null;
  return url;
}

export function parseApplicationGuide(value, policy) {
  if (value === null || value === undefined) return null;
  if (
    !record(value) ||
    !text(value.methodText) ||
    !(value.onlineUrl === null || typeof value.onlineUrl === 'string') ||
    !Array.isArray(value.phones) ||
    value.phones.some(
      (phone) =>
        !record(phone) ||
        !safeTelephoneUrl(phone.number) ||
        !text(phone.label) ||
        !['application', 'inquiry'].includes(phone.kind),
    ) ||
    !text(value.visitText) ||
    !Array.isArray(value.documents) ||
    value.documents.some(
      (document) =>
        !record(document) ||
        !identifier(document.id) ||
        !text(document.label) ||
        !document.label.trim(),
    ) ||
    new Set(value.documents.map((document) => document.id)).size !== value.documents.length ||
    !['listed', 'none', 'unknown'].includes(value.documentsStatus) ||
    (value.documentsStatus === 'listed') !== value.documents.length > 0 ||
    !text(value.documentsNote)
  )
    throw invalid();
  return {
    methodText: value.methodText,
    onlineUrl: applicationDestination(value.onlineUrl, policy?.sourceUrl),
    phones: value.phones.map(({ number, label, kind }) => ({ number, label, kind })),
    visitText: value.visitText,
    documents: value.documents.map(({ id, label }) => ({ id, label })),
    documentsStatus: value.documentsStatus,
    documentsNote: value.documentsNote,
  };
}

export function parseApplicationPreparation(value, guide, revisionId) {
  if (value === null || value === undefined) return null;
  if (
    !record(value) ||
    !identifier(value.revision_id) ||
    !Array.isArray(value.prepared_document_ids) ||
    value.prepared_document_ids.some((id) => !identifier(id)) ||
    new Set(value.prepared_document_ids).size !== value.prepared_document_ids.length
  )
    throw invalid();
  if (
    !guide ||
    (revisionId !== undefined && value.revision_id !== revisionId) ||
    value.prepared_document_ids.some(
      (id) => !guide.documents.some((document) => document.id === id),
    )
  )
    return null;
  return {
    revision_id: value.revision_id,
    prepared_document_ids: [...value.prepared_document_ids],
  };
}
