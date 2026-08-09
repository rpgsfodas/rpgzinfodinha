# Ficha VEU RPG — Extensão para Owlbear Rodeo

Uma única extensão, dois comportamentos:

- **Jogador**: vê a ficha completa (a mesma que você mandou, com atributos, anomalias,
  status de combate, perícias e inventário).
- **Mestre**: não vê ficha nenhuma — vê o **Painel do Mestre**, com um card por
  jogador mostrando PV/PE/SAN em barras, defesa/esquiva/bloqueio/movimento,
  atributos, perícias em destaque e inventário. Tudo atualiza sozinho, em tempo real.

## Como funciona por baixo dos panos

O manifest do Owlbear só permite **um** popover por extensão, então não existem
"duas telas" separadas — existe uma página só (`index.html`) que decide o que
mostrar assim que abre, perguntando ao SDK: `OBR.player.getRole()`.
Se for `"GM"`, mostra o painel. Se for `"PLAYER"`, mostra a ficha.

**Onde os dados ficam salvos:** cada jogador grava a própria ficha na
**metadata do seu jogador** (`OBR.player.setMetadata`), não na metadata da sala.
Isso é o padrão recomendado pelo Owlbear e evita o limite de 16kB da sala
(que é compartilhado com outras extensões). O painel do mestre lê a ficha de
todo mundo com `OBR.party.getPlayers()`, que já traz a metadata de cada
jogador conectado, e se atualiza sozinho com `OBR.party.onChange`.

**Como o mestre consegue tirar PV de um jogador:** a API do Owlbear não deixa
um cliente escrever direto na metadata de outro jogador (por segurança/arquitetura).
Então o painel do mestre manda uma mensagem (`OBR.broadcast.sendMessage`) pedindo
o ajuste, e é o próprio cliente do jogador quem aplica a mudança na sua ficha.
Para isso funcionar mesmo com a ficha fechada, existe um `background.html`
(declarado no `manifest.json` como `background_url`) — um script invisível que
fica sempre rodando enquanto o jogador está na sala, só esperando por esses pedidos.

```
manifest.json      -> descreve a extensão para o Owlbear
index.html          -> a página única (ficha OU painel, dependendo do papel)
app.js               -> toda a lógica: roteador + ficha + painel do mestre
style.css            -> visual (tema escuro, igual ao original)
background.html/.js  -> processo invisível que aplica os ajustes do mestre
icon.svg              -> ícone da extensão na barra lateral
```

## Rodando localmente para testar

Owlbear exige que a extensão seja servida por **HTTPS**. Para testar local,
rode um servidor simples e exponha com alguma ferramenta de túnel:

```bash
cd owlbear-ficha-veu
python3 -m http.server 8000
```

Depois exponha a porta 8000 (ex.: `ngrok http 8000`) e use a URL pública
`https://SEU-TUNEL/manifest.json` na instalação (próximo passo).

## Publicando de verdade

O jeito mais simples e gratuito é o **GitHub Pages**:

1. Crie um repositório público e suba todos os arquivos desta pasta na raiz.
2. Em *Settings → Pages*, ative o Pages apontando para a branch `main` (pasta `/`).
3. Sua extensão ficará em `https://SEU-USUARIO.github.io/SEU-REPO/manifest.json`.

Vercel e Netlify também funcionam (é só servir os arquivos estáticos como estão).

## Instalando no Owlbear Rodeo

1. No Owlbear, abra seu perfil → **Add Extension**.
2. Cole a URL do seu `manifest.json`.
3. Ao criar (ou editar) a sala, ative a extensão "Ficha VEU RPG" na lista.
4. O ícone aparece no canto superior esquerdo da sala. Cada jogador clica e
   preenche a própria ficha; o mestre clica e já vê o painel.

## Limitações a saber

- O painel do mestre só lista jogadores **conectados no momento** (é assim que
  a API `party.getPlayers()` funciona — reflete quem está na sala agora).
- Os botões de ajuste rápido do mestre (PV -5/-1/+1/+5 e Mod. Perícias) dependem
  do jogador estar com o Owlbear aberto (o `background.html` roda em segundo
  plano automaticamente enquanto ele estiver na sala, não precisa da ficha aberta).
- A metadata do jogador é visível para qualquer extensão da sala — isso é uma
  característica da própria plataforma, não desta extensão.

## Personalizando

- **Perícias, classes e fórmulas**: tudo isso está em `app.js`, nas constantes
  do topo (`listaPericiasNomes`) e nas funções `atualizarStatusClasse` /
  `calcularPontosPericias` / `calcularPontosTotais` — é onde estão as regras do
  seu sistema (PV/PE/SAN por classe, pontos de atributo por nível etc).
- **Visual**: `style.css`, variáveis `:root` no topo do arquivo (cores).
- **ID da extensão**: se for publicar de verdade, troque `com.veurpg.ficha`
  no topo do `app.js` e do `background.js` (precisam ficar iguais) por algo
  único seu, para não colidir com metadata de outras extensões.
