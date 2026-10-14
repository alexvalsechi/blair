# Cronograma de implementação

## Fase 1 — MVP de reunião (semana 1)

- Base Electron + React + TypeScript para Windows.
- Preload seguro e contratos IPC tipados.
- Configuração guiada da OpenAI e armazenamento protegido da chave.
- Barra inferior, entrada superior e painel de resposta.
- `Ctrl+Enter`, `Ctrl+E`, visibilidade, sempre no topo e opacidade.
- Captura com confirmação, envio multimodal e tratamento de erros.
- Build instalável e testes básicos em Windows 10/11.

Critério de saída: pergunta textual e captura confirmada produzem resposta no overlay sem login e sem expor a chave ao renderer.

## Fase 2 — Robustez e uso diário (semana 2)

- Streaming de resposta e cancelamento.
- Seletor de monitor/janela/região.
- Histórico local opt-in e exclusão rápida.
- Personalização de atalhos, posição, tamanho e opacidade.
- Diagnóstico de proteção de conteúdo por aplicativo de reunião.
- Atualizador, logs locais redigidos e recuperação de falhas.

## Fase 3 — Áudio e reuniões (semanas 3–4)

Status: implementada em 14/10/2026.

- Captura de microfone e áudio recebido com consentimento visível.
- Transcrição incremental.
- Resumo de reunião, tópicos, decisões e próximos passos.
- Controles claros de pausa, retenção e descarte.

## Fase 4 — Assistentes e contexto (semanas 5–6)

Status: implementada em 14/10/2026.

- Perfis de assistente com instruções próprias.
- Memória local pesquisável e exportação.
- Anexos e contexto selecionado pelo usuário.
- Modelos adicionais da OpenAI e políticas de custo.

## Fase 5 — Ecossistema opcional (após semana 6)

- Outros provedores por adaptadores isolados.
- Modelos locais compatíveis com OpenAI.
- Conectores autorizados para agenda e documentos.
- Assinatura de binário, telemetria opt-in e distribuição pública.

As datas são estimativas para uma pessoa desenvolvedora e devem ser recalibradas após o primeiro build validado em duas versões do Windows.
