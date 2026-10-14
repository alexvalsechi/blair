# Persona Desktop

<!-- impeccable:product-schema 1 -->

## Platform

web

Aplicação exclusiva para Windows 10/11, distribuída com Electron. Não haverá código, atalhos nem fluxos específicos de macOS.

## Stack

Electron + React + TypeScript + Vite. O processo principal controla janelas, atalhos e captura; o renderer recebe apenas APIs explícitas por um preload com `contextIsolation` ativo e `nodeIntegration` desativado.

## Users

Profissionais que participam de reuniões, entrevistas e chamadas no Windows e precisam consultar uma IA sem abandonar o aplicativo em que estão trabalhando.

## Product Purpose

Ser um copiloto discreto para reuniões: uma barra mínima, sempre acessível por teclado, recebe perguntas ou uma captura de tela e mostra a resposta da OpenAI em uma sobreposição reposicionável e com opacidade ajustável.

O MVP é bem-sucedido quando o usuário configura a própria chave OpenAI uma vez e consegue:

- abrir a pergunta com `Ctrl+Enter`;
- capturar a tela com `Ctrl+E` após consentimento explícito;
- ler a resposta em uma janela de sobreposição discreta;
- aumentar ou reduzir a opacidade sem sair da reunião.

## Positioning

Um assistente Windows local-first, sem conta própria, assinatura ou paywall. A aplicação nova não desbloqueia nem modifica o Perssua: implementa recursos próprios, por desenho, em uma reconstrução clean-room.

## Operating Context

- A barra de ações permanece compacta no rodapé e aparece acima das demais janelas.
- `Ctrl+Enter` abre/foca uma segunda faixa de entrada no topo; quando a entrada está ativa, envia a pergunta.
- `Ctrl+E` inicia a captura da tela e só envia a imagem após confirmação do usuário.
- A resposta aparece em um painel independente, rolável e movível, sem ocupar a tela inteira.
- `Ctrl+Shift++` e `Ctrl+Shift+-` ajustam a opacidade das janelas flutuantes.
- A janela de configuração é separada do overlay e serve apenas para chave, modelo, comportamento e atalhos.

## MVP Capabilities

- Windows-only.
- Sem login, cadastro, assinatura, plano premium ou paywall.
- Configuração guiada da OpenAI: chave de API, modelo e teste de conexão.
- Chave protegida com `safeStorage`; nunca persistida em texto puro nem exposta ao renderer.
- Barra de ações inferior: perguntar, capturar tela, abrir configuração e ocultar.
- Entrada superior compacta para perguntas.
- Respostas da OpenAI com texto e imagem via Responses API.
- Overlay sempre no topo, movível, rolável e com opacidade entre um mínimo legível e 100%.
- Ocultar da barra de tarefas e habilitar proteção de conteúdo quando suportada pelo Windows.
- Atalhos globais: `Ctrl+Enter`, `Ctrl+E`, `Ctrl+B`, `Ctrl+M`, `Ctrl+Shift++` e `Ctrl+Shift+-`.
- Estados claros de carregamento, erro, cancelamento e ausência de configuração.

## Constraints

- Invisibilidade significa discrição e exclusão de capturas de tela quando o Windows e o aplicativo de reunião respeitarem a API; não é garantia universal.
- O produto não tenta burlar monitoramento, políticas corporativas, proctoring ou mecanismos de segurança.
- Captura e envio exigem ação consciente do usuário; não haverá gravação silenciosa no MVP.
- Não copiar código, marca, textos, prompts, ícones ou ativos proprietários do Perssua.
- OpenAI é o único provedor do MVP, com fronteira interna preparada para provedores futuros.

## Evidence on Hand

A instalação autorizada do Perssua 0.27.1 foi observada com REA como referência comportamental. A execução mostrou:

- uma janela Electron transparente para o overlay e outra para a tela principal;
- barra compacta inferior e entrada de pergunta separada no topo;
- `Ctrl+Enter` para pergunta/envio, `Ctrl+E` para captura e `Ctrl+D` para áudio;
- atalhos para visibilidade, barra, sempre no topo, movimento e opacidade;
- controle de privacidade baseado em proteção de conteúdo do Windows;
- configuração de provedores separada da experiência de reunião.

Essas evidências descrevem comportamento observável, não autorizam reutilização de implementação proprietária.

## Product Principles

- O overlay é o produto principal; configurações são suporte.
- Uma ação de teclado deve chegar à IA em poucos segundos.
- A resposta deve ser legível sem dominar a reunião.
- Privacidade, consentimento e previsibilidade vêm antes da automação.
- O renderer nunca recebe acesso irrestrito ao Node.js ou à chave de API.
- A interface evita painéis administrativos densos no fluxo de reunião.

## Accessibility & Inclusion

O fluxo principal deve ser operável por teclado, manter foco visível, oferecer contraste WCAG AA no estado de opacidade padrão e respeitar redução de movimento. A redução extrema de opacidade deve exibir um aviso de legibilidade.
