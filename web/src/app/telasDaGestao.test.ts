import { afterEach, describe, expect, it, vi } from 'vitest';
import { comRecargaSeAVersaoMudou } from './telasDaGestao';

// Depois de um deploy, a tela que ainda não tinha sido baixada pede um arquivo que não
// existe mais. A regra: recarregar uma vez para pegar a versão nova; nunca em ciclo;
// nunca sem internet.

const arquivoSumiu = () =>
  Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/Reports-abc.js'));

function semInternet() {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
}

afterEach(() => {
  // Volta ao onLine do protótipo.
  delete (navigator as { onLine?: boolean }).onLine;
  vi.useRealTimers();
});

describe('recarga quando a tela é de uma versão que saiu do ar', () => {
  it('carregou: nada de recarregar', async () => {
    const recarregar = vi.fn();
    const carregar = comRecargaSeAVersaoMudou(() => Promise.resolve('tela'), recarregar);
    await expect(carregar()).resolves.toBe('tela');
    expect(recarregar).not.toHaveBeenCalled();
  });

  it('primeira falha: recarrega uma vez, e a promessa fica esperando (nada pisca)', async () => {
    const recarregar = vi.fn();
    const resultado = vi.fn();
    comRecargaSeAVersaoMudou(arquivoSumiu, recarregar)().then(resultado, resultado);
    await vi.waitFor(() => expect(recarregar).toHaveBeenCalledOnce());
    await new Promise((r) => setTimeout(r, 20));
    expect(resultado).not.toHaveBeenCalled();
  });

  it('falhou de novo logo depois de recarregar: vai para a tela de erro, sem ciclo', async () => {
    const recarregar = vi.fn();
    const carregar = comRecargaSeAVersaoMudou(arquivoSumiu, recarregar);
    void carregar();
    await vi.waitFor(() => expect(recarregar).toHaveBeenCalledOnce());

    // A página "recarregou" e a mesma tela falhou de novo.
    await expect(carregar()).rejects.toThrow(/dynamically imported module/);
    expect(recarregar).toHaveBeenCalledOnce();
  });

  it('outra tela carregar bem no meio não apaga a marca (o ciclo que já aconteceu)', async () => {
    const recarregar = vi.fn();
    void comRecargaSeAVersaoMudou(arquivoSumiu, recarregar)();
    await vi.waitFor(() => expect(recarregar).toHaveBeenCalledOnce());

    await comRecargaSeAVersaoMudou(() => Promise.resolve('menu'), recarregar)();
    await expect(comRecargaSeAVersaoMudou(arquivoSumiu, recarregar)()).rejects.toThrow();
    expect(recarregar).toHaveBeenCalledOnce();
  });

  it('o próximo deploy, horas depois, recarrega de novo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T10:00:00'));
    const recarregar = vi.fn();
    void comRecargaSeAVersaoMudou(arquivoSumiu, recarregar)();
    await vi.waitFor(() => expect(recarregar).toHaveBeenCalledTimes(1));

    vi.setSystemTime(new Date('2026-10-15T10:00:11'));
    void comRecargaSeAVersaoMudou(arquivoSumiu, recarregar)();
    await vi.waitFor(() => expect(recarregar).toHaveBeenCalledTimes(2));
  });

  it('sem internet: não recarrega (trocaria o Echo pela página de erro do navegador)', async () => {
    semInternet();
    const recarregar = vi.fn();
    await expect(comRecargaSeAVersaoMudou(arquivoSumiu, recarregar)()).rejects.toThrow();
    expect(recarregar).not.toHaveBeenCalled();
    // E não gasta a recarga: quando a rede voltar, ela ainda vale.
    expect(sessionStorage.getItem('echo_recarga_por_versao')).toBeNull();
  });

  it('sem como guardar a marca: não arrisca um ciclo de recargas', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const recarregar = vi.fn();
    await expect(comRecargaSeAVersaoMudou(arquivoSumiu, recarregar)()).rejects.toThrow();
    expect(recarregar).not.toHaveBeenCalled();
  });
});
