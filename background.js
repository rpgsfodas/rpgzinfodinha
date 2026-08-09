// Este script roda continuamente em segundo plano para CADA cliente conectado
// à sala (jogador ou mestre), independente do popover da ficha estar aberto.
// Ele é o único responsável por escrever na metadata do jogador quando o
// pedido vem de fora (do painel do mestre), porque a API do Owlbear só deixa
// cada cliente alterar a PRÓPRIA metadata — por isso o mestre não escreve
// direto nos dados do jogador, ele manda uma mensagem via Broadcast e o
// cliente do próprio jogador aplica a alteração.

const ID = "com.veurpg.ficha";
const META_KEY = `${ID}/dados`;
const CH_AJUSTE = `${ID}/ajuste-mestre`;

function clamp(valor, min, max) {
  return Math.max(min, Math.min(valor, max));
}

function aplicarAjuste(ficha, pedido) {
  const { chave, delta, valor } = pedido;
  if (!ficha.status) ficha.status = {};
  const status = ficha.status;

  const aplicarNumero = (atualKey, maxKey, min = 0) => {
    const max = parseInt(status[maxKey], 10) || 0;
    const atual = parseInt(status[atualKey], 10) || 0;
    const novo = valor !== undefined ? parseInt(valor, 10) || 0 : atual + delta;
    status[atualKey] = clamp(novo, min, Math.max(min, max));
  };

  switch (chave) {
    case "pvs_atual":
      aplicarNumero("pvs_atual", "pvs_max");
      break;
    case "pes_atual":
      aplicarNumero("pes_atual", "pes_max");
      break;
    case "san_atual":
      aplicarNumero("san_atual", "san_max");
      break;
    case "mod_pericias": {
      const atual = parseInt(status.mod_pericias, 10) || 0;
      status.mod_pericias = valor !== undefined ? (parseInt(valor, 10) || 0) : atual + delta;
      break;
    }
    default:
      break;
  }
  return ficha;
}

try {
  if (typeof OBR !== "undefined") {
    OBR.onReady(async () => {
      OBR.broadcast.onMessage(CH_AJUSTE, async (event) => {
        try {
          const pedido = event.data || {};
          const meuId = OBR.player.id;
          if (!pedido.targetId || pedido.targetId !== meuId) return;

          const metadata = await OBR.player.getMetadata();
          const fichaAtual = metadata[META_KEY];
          if (!fichaAtual) return;

          const fichaAtualizada = aplicarAjuste(
            JSON.parse(JSON.stringify(fichaAtual)),
            pedido
          );

          await OBR.player.setMetadata({ [META_KEY]: fichaAtualizada });
        } catch (err) {
          console.error("Ficha VEU RPG (background): erro ao aplicar ajuste", err);
        }
      });
    });
  }
} catch (err) {
  console.error("Ficha VEU RPG (background): erro ao iniciar SDK", err);
}
