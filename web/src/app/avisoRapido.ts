// Aviso curto depois de uma ação ("Ocorrência marcada como Resolvida"), mostrado pelo
// layout da gestão. O layout fica montado entre as telas, então o aviso sobrevive à
// navegação: a tela salva, volta para a anterior, e é lá que a pessoa vê a confirmação.

export const EVENTO_AVISO_RAPIDO = 'echo:aviso-rapido';

export function avisarRapido(texto: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENTO_AVISO_RAPIDO, { detail: texto }));
}
