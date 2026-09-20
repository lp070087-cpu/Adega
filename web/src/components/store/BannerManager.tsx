'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  createBannerAction,
  deleteBannerAction,
  reorderBannersAction,
  toggleBannerAction,
  updateBannerAction,
  uploadBannerImageAction,
} from '@/app/actions/store-ops';
import {
  BANNER_ACCEPT_ATTR,
  BANNER_LIBRARY,
  isBannerLibraryPath,
  validateBannerFile,
  type BannerLibraryItem,
} from '@/lib/banner-image';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  Textarea,
} from '@/components/ui';
import type { StoreBannerView } from '@/lib/data/store-ops';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * BANNERS DA VITRINE (Fase 2 — upload de arquivo)
 * -----------------------------------------------------------------------
 * REGRA 7: o banner deixou de ser "cole uma URL" e passou a ser "envie o
 * arquivo". O lojista não precisa mais hospedar a imagem em lugar nenhum —
 * o arquivo sobe pelo adapter de storage da plataforma (`getStorage`), que
 * continua sendo a única porta de entrada de binário. Nada de base64 no
 * banco e nada de disco local improvisado.
 *
 * Validações no cliente (formato, tamanho máximo, proporção e dimensão
 * recomendada) são um ATALHO de usabilidade — a validação de verdade é a
 * do servidor (`uploadBannerImageAction`), que confere formato e tamanho
 * de novo e só devolve a URL que o storage gerou.
 *
 * ── Duas origens, um só salvar ──
 * Além do upload (que continua exatamente como era), o modal oferece
 * ESCOLHER UMA IMAGEM DO ACERVO — um arquivo que já está no repositório,
 * em `public/catalog/banners/`. A escolha grava o caminho público
 * (`/catalog/banners/banner-01.png`) direto em `imagePath`, sem passar
 * pelo storage: o arquivo já está publicado, subir de novo seria duplicar.
 *
 * O que decide entre as duas é qual origem foi mexida por último, e não um
 * botão separado: escolher do acervo descarta o arquivo pendente, e
 * escolher um arquivo limpa a escolha do acervo. Assim nunca há dúvida
 * sobre o que o "Salvar" vai gravar.
 *
 * Os banners DAQUI são só os da loja. Quando ela não tem nenhum, a
 * vitrine usa os padrões da plataforma para o segmento — o lojista não
 * vê, não edita e não apaga esses, e é por isso que a tela precisa
 * explicar que o padrão existe.
 *
 * Ordenação: subir/descer, sem drag-and-drop. Uma lista de banners tem
 * poucos itens; arrastar traria complexidade de acessibilidade sem
 * ganho real nesta fase.
 * ═══════════════════════════════════════════════════════════════════════
 */

type Draft = {
  id: string | null;
  title: string;
  subtitle: string;
  imagePath: string;
  linkUrl: string;
  active: boolean;
};

const EMPTY: Draft = { id: null, title: '', subtitle: '', imagePath: '', linkUrl: '', active: true };

/** Dimensão recomendada para o topo da vitrine (proporção 4:1). */
const RECOMMENDED_WIDTH = 1200;
const RECOMMENDED_HEIGHT = 300;
const IDEAL_RATIO = 4;

/** Lê as dimensões reais de um arquivo de imagem no navegador. */
function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível ler as dimensões da imagem.'));
    };
    img.src = url;
  });
}

/** Formata a proporção como "4:1" (uma casa decimal). */
function describeRatio(width: number, height: number): string {
  if (height <= 0) return '—';
  const ratio = width / height;
  const rounded = Math.round(ratio * 10) / 10;
  return `${rounded.toLocaleString('pt-BR')}:1`;
}

export function BannerManager({
  banners,
  defaultBannerCount,
  canManage,
}: {
  banners: StoreBannerView[];
  /** Quantos banners padrão da plataforma existem para este segmento. */
  defaultBannerCount: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StoreBannerView | null>(null);

  // Arquivo escolhido mas ainda não enviado (sobe junto com o "Salvar").
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageInfo, setImageInfo] = useState<{ width: number; height: number } | null>(null);

  // Descarta a pré-visualização local (object URL) para não vazar memória.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function resetFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPendingFile(null);
    setImageInfo(null);
    setImageError(null);
  }

  function beginNew() {
    resetFile();
    setDraft({ ...EMPTY });
  }

  function beginEdit(banner: StoreBannerView) {
    resetFile();
    setDraft({
      id: banner.id,
      title: banner.title ?? '',
      subtitle: banner.subtitle ?? '',
      imagePath: banner.imagePath,
      linkUrl: banner.linkUrl ?? '',
      active: banner.active,
    });
  }

  /**
   * Escolher uma imagem do acervo.
   *
   * Descartar o arquivo pendente (`resetFile`) não é detalhe: sem isso, um
   * arquivo escolhido antes continuaria no estado e o `save()` subiria ele,
   * ignorando a escolha do acervo que o lojista acabou de fazer na tela.
   */
  function chooseFromLibrary(item: BannerLibraryItem) {
    resetFile();
    setDraft((current) => (current ? { ...current, imagePath: item.path } : current));
  }

  /** Volta para "envie um arquivo" quando o banner NÃO é do acervo. */
  function clearImage() {
    if (isBannerLibraryPath(draft?.imagePath)) {
      resetFile();
      setDraft((current) => (current ? { ...current, imagePath: '' } : current));
    }
  }

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onOk?.();
      router.refresh();
    });
  }

  /**
   * Quando o lojista escolhe um arquivo, valida na hora o formato e o
   * tamanho (o que dá para conferir sem abrir o arquivo) e lê as
   * dimensões para mostrar a proporção. A validação definitiva continua
   * no servidor; aqui é só para não deixar a pessoa preencher o formulário
   * inteiro para descobrir no final que o arquivo não serve.
   */
  async function onFileChange(file: File | null) {
    setImageError(null);
    if (!file) return;

    // Mesma função que o servidor usa (`@/lib/banner-image`): formato e
    // tamanho são a MESMA regra, não duas parecidas. Aqui é atalho de
    // usabilidade; a barreira real continua sendo a do `uploadBannerImageAction`.
    const invalidFile = validateBannerFile(file);
    if (invalidFile) {
      setImageError(invalidFile);
      return;
    }

    let dimensions: { width: number; height: number };
    try {
      dimensions = await readImageDimensions(file);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Não foi possível ler a imagem.');
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setPendingFile(file);
    setImageInfo(dimensions);
  }

  async function save() {
    if (!draft) return;
    setError(null);
    setFieldError(null);
    setImageError(null);

    startTransition(async () => {
      let imagePath = draft.imagePath;

      // Se há arquivo novo, sobe primeiro e usa a URL devolvida.
      if (pendingFile) {
        const formData = new FormData();
        formData.set('file', pendingFile);
        const uploaded = await uploadBannerImageAction(formData);
        if (!uploaded.ok) {
          if (uploaded.field === 'file' || uploaded.field === 'imagePath') {
            setImageError(uploaded.error);
          } else {
            setError(uploaded.error);
          }
          return;
        }
        imagePath = uploaded.data?.url ?? '';
      }

      if (!imagePath) {
        setImageError('Envie a imagem do banner.');
        return;
      }

      const payload = {
        title: draft.title,
        subtitle: draft.subtitle,
        imagePath,
        linkUrl: draft.linkUrl,
        active: draft.active,
      };

      const result = draft.id
        ? await updateBannerAction(draft.id, payload)
        : await createBannerAction(payload);

      if (!result.ok) {
        setError(result.error);
        setFieldError(result.field ?? null);
        return;
      }
      resetFile();
      setDraft(null);
      router.refresh();
    });
  }

  /** Move um banner uma posição e manda a lista inteira na ordem final. */
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= banners.length) return;
    const ids = banners.map((b) => b.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    run(() => reorderBannersAction(ids));
  }

  // `previewUrl` só existe quando há arquivo escolhido, e nesse caso ele
  // ganha — é o que acabou de ser selecionado. Sem arquivo, o caminho do
  // rascunho serve igual para URL http(s) e para `/catalog/banners/...`.
  const previewSource = previewUrl ?? draft?.imagePath ?? null;
  const usingLibraryImage = isBannerLibraryPath(draft?.imagePath);
  const ratioOff =
    imageInfo && imageInfo.height > 0 && Math.abs(imageInfo.width / imageInfo.height - IDEAL_RATIO) > 1;

  return (
    <div className="space-y-4">
      {error && (
        <Alert tone="danger" title="Não foi possível concluir">
          {error}
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Banners do topo da vitrine"
          subtitle="As imagens que aparecem girando no alto da sua loja."
          action={
            canManage ? (
              <Button size="sm" onClick={beginNew} disabled={pending}>
                + Novo banner
              </Button>
            ) : undefined
          }
        />

        {banners.length === 0 ? (
          <EmptyState
            icon="🖼️"
            title="Você ainda não cadastrou banners"
            description={
              defaultBannerCount > 0
                ? `Enquanto você não cadastrar os seus, a vitrine mostra ${defaultBannerCount} banner(s) padrão do seu segmento. Assim que o primeiro banner seu entrar no ar, os padrões saem de cena.`
                : 'A vitrine está usando o destaque dinâmico, montado com os seus produtos marcados como destaque. Não é obrigatório ter banner.'
            }
            action={
              canManage ? (
                <Button onClick={beginNew}>Cadastrar o primeiro</Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="space-y-3">
            {banners.map((banner, index) => (
              <li
                key={banner.id}
                className="flex flex-col gap-3 rounded-lg border border-ink-100 p-3 sm:flex-row sm:items-center"
              >
                {/* Miniatura honesta: se o arquivo não existir, aparece o
                    aviso em vez de uma imagem quebrada. */}
                <div className="h-[64px] w-full flex-shrink-0 overflow-hidden rounded border border-ink-100 bg-ink-50 sm:w-[140px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={banner.imagePath}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[0.86rem] font-semibold text-ink-800">
                      {banner.title}
                    </span>
                    <Badge tone={banner.active ? 'green' : 'neutral'}>
                      {banner.active ? 'No ar' : 'Pausado'}
                    </Badge>
                    <Badge tone="neutral">#{index + 1}</Badge>
                  </div>
                  {banner.subtitle && (
                    <p className="mt-0.5 truncate text-[0.76rem] text-ink-500">{banner.subtitle}</p>
                  )}
                  {banner.linkUrl && (
                    <p className="mt-0.5 truncate text-[0.72rem] text-ink-400">
                      Leva para: {banner.linkUrl}
                    </p>
                  )}
                </div>

                {canManage && (
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      disabled={pending || index === 0}
                      onClick={() => move(index, -1)}
                      className="rounded-sm px-2 py-1.5 text-[0.8rem] text-ink-500 transition-all hover:bg-ink-100 disabled:opacity-30"
                      aria-label={`Mover ${banner.title} para cima`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={pending || index === banners.length - 1}
                      onClick={() => move(index, 1)}
                      className="rounded-sm px-2 py-1.5 text-[0.8rem] text-ink-500 transition-all hover:bg-ink-100 disabled:opacity-30"
                      aria-label={`Mover ${banner.title} para baixo`}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          toggleBannerAction({ bannerId: banner.id, active: !banner.active }),
                        )
                      }
                      className="rounded-sm px-2.5 py-1.5 text-[0.74rem] font-semibold text-ink-600 transition-all hover:bg-ink-100 disabled:opacity-50"
                    >
                      {banner.active ? 'Pausar' : 'Publicar'}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => beginEdit(banner)}
                      className="rounded-sm px-2.5 py-1.5 text-[0.74rem] font-semibold text-ink-600 transition-all hover:bg-ink-100 disabled:opacity-50"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setConfirmDelete(banner)}
                      className="rounded-sm px-2.5 py-1.5 text-[0.74rem] font-semibold text-danger transition-all hover:bg-danger-bg disabled:opacity-50"
                    >
                      Excluir
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-[0.72rem] text-ink-400">
          Você envia o arquivo da imagem — a plataforma guarda e devolve o endereço — ou escolhe uma
          imagem que já faz parte do acervo. Sem banner cadastrado, a vitrine usa o destaque montado
          com os seus produtos.
        </p>
      </Card>

      {/* ── Editor ─────────────────────────────────────────────────── */}
      <Modal
        open={draft !== null}
        onClose={() => {
          resetFile();
          setDraft(null);
        }}
        title={draft?.id ? 'Editar banner' : 'Novo banner'}
        subtitle="Envie o arquivo da imagem (formato largo, 4:1) ou escolha uma que já existe no acervo."
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                resetFile();
                setDraft(null);
              }}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button loading={pending} onClick={save}>
              {draft?.id ? 'Salvar banner' : 'Criar banner'}
            </Button>
          </>
        }
      >
        {draft && (
          <>
            <Field
              label="Título"
              required
              error={fieldError === 'title' ? error ?? undefined : undefined}
            >
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                maxLength={80}
                placeholder="Ex.: Promoção de sexta"
              />
            </Field>

            <Field label="Subtítulo" hint="Uma linha de apoio. Opcional.">
              <Textarea
                value={draft.subtitle}
                onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
                rows={2}
                maxLength={160}
              />
            </Field>

            <Field
              label="Imagem do banner"
              required
              hint={`Recomendado ${RECOMMENDED_WIDTH} × ${RECOMMENDED_HEIGHT} px (proporção ${IDEAL_RATIO}:1). Formatos PNG, JPG, JPEG ou WEBP, até 5 MB.`}
              error={imageError ?? undefined}
            >
              <label
                className={cn(
                  'block cursor-pointer rounded border-2 border-dashed px-4 py-6 text-center transition-all',
                  imageError
                    ? 'border-danger bg-danger-bg/30'
                    : 'border-ink-200 hover:border-brand hover:bg-ink-50',
                )}
              >
                <input
                  type="file"
                  accept={BANNER_ACCEPT_ATTR}
                  onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
                  className="sr-only"
                />
                <span className="block text-[0.86rem] font-semibold text-ink-700">
                  {pendingFile
                    ? pendingFile.name
                    : usingLibraryImage
                      ? 'Imagem do acervo escolhida — clique para enviar um arquivo'
                      : draft.imagePath
                        ? 'Imagem atual mantida — clique para trocar'
                        : 'Clique para enviar a imagem'}
                </span>
                <span className="mt-1 block text-[0.72rem] text-ink-400">
                  {pendingFile
                    ? 'Clique para escolher outro arquivo.'
                    : usingLibraryImage
                      ? 'A escolha do acervo só sai do lugar quando você envia um arquivo.'
                      : 'O arquivo sobe ao salvar o banner.'}
                </span>
              </label>

              {imageInfo && (
                <p className="mt-1.5 text-[0.72rem] text-ink-500">
                  Medida: {imageInfo.width} × {imageInfo.height} px · proporção{' '}
                  {describeRatio(imageInfo.width, imageInfo.height)}
                  {ratioOff && (
                    <span className="ml-1 font-semibold text-warn">
                      — fica melhor em {IDEAL_RATIO}:1 (ex.: {RECOMMENDED_WIDTH} ×{' '}
                      {RECOMMENDED_HEIGHT}).
                    </span>
                  )}
                </p>
              )}
            </Field>

            {/* ── Acervo da plataforma ───────────────────────────────────
                Alternativa ao upload. A lista (`BANNER_LIBRARY`) é o único
                lugar do código com nomes de arquivo de banner; acrescentar
                um banner novo à pasta é acrescentar o nome lá. A validação
                do servidor aceita qualquer
                `/catalog/banners/<arquivo>.<ext>`, então o arquivo novo já
                funciona mesmo antes de aparecer nesta grade. */}
            {BANNER_LIBRARY.length > 0 && (
              <Field
                label="Ou use uma imagem do acervo"
                hint="Imagens que já fazem parte da plataforma. Não precisam de upload."
              >
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {/* As miniaturas abaixo são a ÚNICA checagem de existência
                      do arquivo, e é de propósito: uma consulta ao servidor
                      por banner deixaria a tela lenta para avisar algo que o
                      próprio <img> já mostra (miniatura vazia). A validação
                      de verdade é de forma, no servidor. */}
                  {BANNER_LIBRARY.map((item) => {
                    const selected = draft.imagePath === item.path;
                    return (
                      <li key={item.path}>
                        <button
                          type="button"
                          onClick={() => chooseFromLibrary(item)}
                          aria-pressed={selected}
                          title={item.path}
                          className={cn(
                            'block w-full overflow-hidden rounded border-2 text-left transition-all',
                            selected
                              ? 'border-brand'
                              : 'border-ink-100 hover:border-ink-200',
                          )}
                        >
                          <span className="block h-[46px] bg-ink-50">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.path}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </span>
                          <span
                            className={cn(
                              'block truncate px-2 py-1 text-[0.7rem] font-semibold',
                              selected ? 'bg-brand-light/40 text-ink-800' : 'text-ink-500',
                            )}
                          >
                            {selected ? '✓ ' : ''}
                            {item.label}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Field>
            )}

            {previewSource && (
              <div className="mb-3.5">
                <p className="mb-1 text-[0.72rem] font-semibold text-ink-500">Prévia</p>
                <div className="h-[110px] overflow-hidden rounded border border-ink-100 bg-ink-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewSource} alt="" className="h-full w-full object-cover" />
                </div>
                {usingLibraryImage && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="text-[0.72rem] text-ink-500">
                      Imagem do acervo · <code>{draft.imagePath}</code>
                    </p>
                    <Button size="sm" variant="ghost" onClick={clearImage} disabled={pending}>
                      Enviar um arquivo em vez desta
                    </Button>
                  </div>
                )}
              </div>
            )}

            <Field
              label="Link ao clicar"
              hint="Opcional. Leva o cliente para uma página ou campanha."
              error={fieldError === 'linkUrl' ? error ?? undefined : undefined}
            >
              <Input
                value={draft.linkUrl}
                onChange={(e) => setDraft({ ...draft, linkUrl: e.target.value })}
                placeholder="https://…"
              />
            </Field>

            <label className="flex cursor-pointer items-center gap-2.5 text-[0.84rem] text-ink-700">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                className="h-4 w-4 cursor-pointer accent-[var(--orange)]"
              />
              Publicar agora
            </label>
          </>
        )}
      </Modal>

      {/* ── Confirmação de exclusão ────────────────────────────────── */}
      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Excluir banner"
        subtitle="Esta ação não pode ser desfeita."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)} disabled={pending}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() => {
                const banner = confirmDelete;
                if (!banner) return;
                run(
                  () => deleteBannerAction(banner.id),
                  () => setConfirmDelete(null),
                );
              }}
            >
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-[0.84rem] leading-relaxed text-ink-700">
          O banner <strong>{confirmDelete?.title}</strong> sai do topo da vitrine. O arquivo da
          imagem no seu servidor não é apagado — só a referência.
        </p>
        <p className={cn('mt-2 text-[0.76rem] text-ink-500')}>
          {banners.length === 1
            ? 'Como este é o seu único banner, a vitrine volta a usar o destaque montado com os seus produtos.'
            : 'Os outros banners continuam no ar.'}
        </p>
      </Modal>
    </div>
  );
}
