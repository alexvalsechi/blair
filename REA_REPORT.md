# Relatório de observação do Perssua

## Escopo

Observação autorizada da instalação local `C:\Users\alexv\AppData\Local\Programs\perssua`, usada apenas para compreender comportamento e arquitetura. A reconstrução será independente e clean-room.

## Identidade e stack observadas

- Perssua 0.27.1.
- Electron 37.7.1 / Chromium 138.
- Renderer em React 19 com bundles produzidos por `react-scripts`.
- Separação entre processo principal, preload e renderer.
- `nodeIntegration: false` e `contextIsolation: true`.
- Serviço HTTPS local, SQLite/FTS5, Whisper e integrações com modelos locais e de nuvem presentes no produto completo.

## Comportamento observado em execução

O produto usa duas superfícies distintas:

1. `index.html`: overlay transparente e discreto, mantido acima das outras janelas.
2. `mainApp.html`: janela principal para assistentes, sessões, provedores e preferências.

No overlay, a barra inferior contém o assistente ativo, acesso à tela principal, pergunta e escuta. Ao abrir “Perguntar”, uma segunda faixa surge no topo com captura, opção de web, entrada de texto e envio. O fundo da janela é transparente; apenas os controles flutuantes são desenhados.

## Atalhos confirmados

| Ação | Atalho observado |
|---|---|
| Perguntar / enviar | `Ctrl+Enter` |
| Capturar tela | `Ctrl+E` |
| Gravação de voz | `Ctrl+D` |
| Ocultar/mostrar janela | `Ctrl+B` |
| Ocultar/mostrar barra | `Ctrl+M` |
| Alternar sempre no topo | `Ctrl+Shift+A` |
| Aumentar opacidade | `Ctrl+Shift++` |
| Reduzir opacidade | `Ctrl+Shift+-` |
| Mover verticalmente | `Ctrl+Shift+Up/Down` |

## Invisibilidade e limitações

O modo de privacidade usa proteção de conteúdo da janela para tentar removê-la do compartilhamento de tela. A própria interface avisa que o resultado varia por aplicativo de reunião e recomenda teste prévio. Portanto, a reconstrução deve apresentar isso como melhor esforço, nunca como garantia.

## Decisões para o MVP

- Reproduzir o modelo mental de superfícies separadas, não o visual nem o código do produto observado.
- Manter somente OpenAI, pergunta, captura, resposta e opacidade.
- Não incluir login, créditos, premium, histórico de sessões, áudio, memória, conectores ou modelos locais no primeiro corte.
- Não disparar capturas silenciosas nem chamadas externas durante testes automatizados.

## Evidências REA principais

- Overlay e controles: `ev_b3eb39330154af5f13698b9a015a30be0a6d950f459c171988b2d32667087ece`.
- Captura visual do overlay: `ev_d5bb84bd4ac5840ab0c600d69b6721af5c8158ad1409f2dfb8980ed5634e927f`.
- Janela principal: `ev_103800b834cf500ace1928a9c69d73f1c4fc3cc5d100c2e3f332166651f419fb`.
- Atalhos e opacidade: `ev_b43ae36a5a0cf110ba1899cec3ddb989e5063e02a4924f7db7151cb8605671f1`.
- Privacidade/stealth: `ev_235b8cd3a298ea67414bb8c1b8d1d87509f2864611c509e9e9bcef7b30d81bae`.
