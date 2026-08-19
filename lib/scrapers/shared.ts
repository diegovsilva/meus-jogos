// LiveScore e Transfermarkt às vezes expõem a FASE do mata-mata (ex.:
// "Round of 16", "Oitavas de Final", "Quarterfinal") no lugar onde a gente
// esperava o NOME da competição — resultado: a seção da listagem aparece
// como "ROUND OF 16" em vez de "Copa do Brasil". Sem acesso pra inspecionar
// a resposta bruta desses provedores ao vivo, a correção segura é: se o
// texto capturado bater com um desses padrões, descartar o jogo dessas
// fontes extras (elas são só reforço — perder um jogo duplicado é bem
// melhor que mostrar a fase como se fosse o nome do campeonato).
const ROUND_LABEL_PATTERNS = [
  /^round of \d+$/i,
  /^(quarter|semi)final?s?$/i,
  /^final$/i,
  /^group stage$/i,
  /^(oitavas|quartas|semifinal|final|fase de grupos)( de final)?$/i,
  /^\d+(st|nd|rd|th) round$/i,
  /^rodada \d+$/i,
]

export function looksLikeRoundLabel(text: string): boolean {
  const value = text.trim()
  if (!value) return false
  return ROUND_LABEL_PATTERNS.some((pattern) => pattern.test(value))
}
