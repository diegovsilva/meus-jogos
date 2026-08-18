# Canais autorizados no YouTube

`lib/youtube.ts` (`AUTHORIZED_CHANNELS`) mantém uma lista fixa de canais do
YouTube com direitos de transmissão confirmados manualmente. A busca de
"onde assistir" **só** procura vídeos ao vivo/agendados dentro desses
canais — nunca aceita um vídeo de fora dessa lista, mesmo que o título bata
com os times do jogo. É assim que evitamos indicar lives de rádios, torcidas
organizadas ou qualquer transmissão sem direito.

## Como adicionar um canal novo

1. Confirme que o canal realmente tem direitos de transmissão daquele
   campeonato (não confie só no título do vídeo).
2. Ache o **Channel ID** de verdade — não basta o `@handle`, porque handles
   podem mudar. Formas de achar:
   - Abra a página do canal → "Sobre" → "Compartilhar canal" → "Copiar ID do
     canal" (começa com `UC...`).
   - Ou peça pra IA buscar `youtube.com/@handle` e ler o Channel ID que
     aparece na página.
3. Adicione uma entrada em `AUTHORIZED_CHANNELS` em `lib/youtube.ts`:

```ts
{
  label: "Nome do canal",
  channelId: "UC...",
  broadcastAliases: ["nome usado pelo placar da uol", "outro apelido"],
},
```

O campo `broadcastAliases` não autoriza nada sozinho — só ajuda a escolher
qual canal checar primeiro quando o placar (UOL) já indicou quem tem os
direitos daquele jogo específico, economizando chamadas de API.

## Canais confirmados até agora

| Canal | Direitos conhecidos |
|---|---|
| CazéTV | Copa do Mundo, jogos avulsos |
| Canal GOAT | Diversos, incluindo ligas árabes |
| Sporty Brasil / SportyNet | Diversos campeonatos estaduais/menores |
| TNT Sports Brasil | UEFA Champions League, Europa League |
| UOL Esporte | Cobertura jornalística (raramente transmite jogo completo) |
| Ge TV | Brasileirão, Copa do Brasil, Libertadores |
| Canal GoLBrasil | Libertadores, A-League, ligas russa/chinesa/peruana e outras |
