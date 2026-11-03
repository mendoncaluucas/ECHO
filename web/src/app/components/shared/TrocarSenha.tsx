import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { tokenDaSessao, trocarMinhaSenha, trocarTokenDaSessao } from '../../services/api';
import { avisarRapido } from '../../avisoRapido';
import { CabecalhoDaPagina, Cartao, Pagina } from '../layout/Pagina';

// A pessoa troca a própria senha, nos três papéis. Pede a atual: quem pegasse o celular
// destravado de alguém não trocaria a senha dele. Ao trocar, a API encerra as outras
// sessões da pessoa e devolve um token novo para esta continuar.

const TAMANHO_MINIMO_DA_SENHA = 8;

const campo =
  'h-11 w-full rounded-xl border border-borda-campo bg-input-background px-3.5 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const rotuloDoCampo = 'mb-1.5 block text-sm font-semibold';
const botaoPrimario =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground transition-colors hover:bg-[#0a5242] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const VAZIO = { atual: '', nova: '', confirmacao: '' };

function mensagemDeFalha(e: unknown) {
  const { status, codigo, message } = e as { status?: number; codigo?: string; message?: string };
  if (status === 401 && codigo === 'CREDENCIAIS_INVALIDAS') return 'A senha atual não confere.';
  // Limite de tentativas e validação: a mensagem da API já diz o que fazer.
  if ((codigo === 'MUITAS_REQUISICOES' || status === 400) && message) return message;
  if (codigo === 'SEM_CONEXAO') return message ?? 'Não foi possível conectar ao servidor.';
  return 'Não foi possível trocar a senha. Tente de novo.';
}

export function TrocarSenha() {
  const [senhas, setSenhas] = useState(VAZIO);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [trocou, setTrocou] = useState(false);

  const mudar = (parcial: Partial<typeof VAZIO>) => {
    setSenhas((atual) => ({ ...atual, ...parcial }));
    setErro(null);
    setTrocou(false);
  };

  const curta = senhas.nova.length > 0 && senhas.nova.length < TAMANHO_MINIMO_DA_SENHA;
  const igualAAtual = senhas.nova.length > 0 && senhas.nova === senhas.atual;
  const naoConfere = senhas.confirmacao.length > 0 && senhas.confirmacao !== senhas.nova;
  const podeEnviar =
    senhas.atual.length > 0 &&
    senhas.nova.length >= TAMANHO_MINIMO_DA_SENHA &&
    !igualAAtual &&
    senhas.confirmacao === senhas.nova;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const token = tokenDaSessao();
    if (!podeEnviar || enviando || !token) return;
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await trocarMinhaSenha(senhas.atual, senhas.nova, token);
      // A API de antes (204, sem corpo) troca a senha e não derruba sessão nenhuma: o
      // token atual segue valendo. Acontece na janela do deploy, quando a Vercel já
      // publicou o front e o Render ainda sobe a API; sem isto, a tela diria que falhou
      // uma troca que deu certo.
      if (resposta?.token) trocarTokenDaSessao(resposta.token);
      setSenhas(VAZIO);
      setTrocou(true);
      avisarRapido('Senha trocada');
    } catch (falha) {
      setErro(mensagemDeFalha(falha));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Pagina>
      <CabecalhoDaPagina
        sobretitulo="Sua conta"
        titulo="Trocar minha senha"
        descricao="Ao trocar, as outras sessões abertas com a sua conta, em outro celular ou computador, são encerradas. Esta continua."
      />

      <Cartao className="max-w-xl">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-5">
          <div>
            <label htmlFor="senha-atual" className={rotuloDoCampo}>
              Senha atual
            </label>
            <input
              id="senha-atual"
              type="password"
              autoComplete="current-password"
              value={senhas.atual}
              onChange={(e) => mudar({ atual: e.target.value })}
              className={campo}
            />
          </div>

          <div>
            <label htmlFor="senha-nova" className={rotuloDoCampo}>
              Nova senha
            </label>
            <input
              id="senha-nova"
              type="password"
              autoComplete="new-password"
              value={senhas.nova}
              onChange={(e) => mudar({ nova: e.target.value })}
              aria-describedby="senha-nova-dica"
              aria-invalid={curta || igualAAtual || undefined}
              className={campo}
            />
            <p
              id="senha-nova-dica"
              className={`mt-1.5 text-sm ${curta || igualAAtual ? 'font-semibold text-atencao' : 'text-muted-foreground'}`}
            >
              {igualAAtual
                ? 'A nova senha precisa ser diferente da atual.'
                : `Pelo menos ${TAMANHO_MINIMO_DA_SENHA} caracteres.`}
            </p>
          </div>

          <div>
            <label htmlFor="senha-confirmacao" className={rotuloDoCampo}>
              Repita a nova senha
            </label>
            <input
              id="senha-confirmacao"
              type="password"
              autoComplete="new-password"
              value={senhas.confirmacao}
              onChange={(e) => mudar({ confirmacao: e.target.value })}
              aria-describedby={naoConfere ? 'senha-confirmacao-dica' : undefined}
              aria-invalid={naoConfere || undefined}
              className={campo}
            />
            {naoConfere && (
              <p id="senha-confirmacao-dica" className="mt-1.5 text-sm font-semibold text-atencao">
                As duas não são iguais.
              </p>
            )}
          </div>

          {erro && (
            <p role="alert" className="rounded-xl bg-perigo-fundo px-3.5 py-3 text-sm font-semibold text-perigo">
              {erro}
            </p>
          )}
          {trocou && (
            <p role="status" className="rounded-xl bg-accent px-3.5 py-3 text-sm font-semibold text-accent-foreground">
              Senha trocada. As outras sessões com a sua conta foram encerradas.
            </p>
          )}

          <div className="flex justify-end">
            <button type="submit" disabled={!podeEnviar || enviando} className={botaoPrimario}>
              {enviando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Trocar senha
            </button>
          </div>
        </form>
      </Cartao>
    </Pagina>
  );
}
