# Xorachat — documento inicial do projeto

> Versão 0.1 · 11/10/2026 · rascunho para alinhar ideia, escopo do MVP e stack.
> Versões de bibliotecas conferidas no crates.io e nos repositórios oficiais nesta data.

## 1. Visão geral

**Dor.** O Discord deixou de permitir transmissão de tela no Brasil e as alternativas testadas pelo grupo são ruins.

**Ideia.** Um aplicativo desktop próprio de chat de voz, chat de texto e transmissão de tela com som, para uso entre um grupo de amigos.

**Princípios.**

1. **Leve para quem transmite.** O app roda em segundo plano enquanto a pessoa joga. O custo de capturar, codificar e enviar a tela precisa ser o menor possível.
2. **Simples de usar.** Abrir, digitar apelido e código da sala, entrar. Sem cadastro.
3. **Sem banco de dados.** Nada de usuários persistidos nem histórico no MVP.
4. **Custo zero de infraestrutura** enquanto for um grupo pequeno.

**Plataformas-alvo.** Windows 10/11 e Linux (Fedora e Debian), x86_64.

## 2. Ponto de partida

O repositório atual (`wendeltc/Xorachat`) tem um app web em um único `index.html` (voz, texto e tela via PeerJS em malha P2P) e um invólucro Electron só para Linux, que cria uma fonte virtual de áudio com `pactl` para capturar o som do sistema.

**O que mantemos (comportamento e experiência):**

- Sala identificada por nome; entrar só com apelido.
- Lista de participantes separando "na chamada" e "online", com indicador de quem está falando.
- Silenciar uma pessoa só para mim.
- Chat de texto da sala com mensagens de sistema (entrou, saiu).
- Mutar o microfone não silencia o som da transmissão.
- Modo "só ouvir" quando não há microfone.
- Layout escuro no estilo atual.

**O que muda (e por quê):**

| Hoje | Novo | Motivo |
|---|---|---|
| Malha P2P (PeerJS) | Servidor SFU | Na malha, quem transmite codifica e envia a tela uma vez por espectador. Com SFU envia uma vez só. |
| Só STUN | TURN embutido no servidor | Pares atrás de CGNAT deixam de falhar. |
| Electron + página web | Aplicativo nativo em Rust | Menos memória e controle direto de captura e codificação. |
| Microfone e som da tela mixados em uma faixa | Faixas separadas | Volume independente para voz e transmissão; som do jogo sem filtros de voz. |
| Sala aberta por nome em servidor público | Código de convite + token | Só entra quem tem o código. |

O código atual vai para uma pasta `legacy/` como referência de comportamento.

## 3. Escopo do MVP

### 3.1 Chat de voz

- Entrar e sair da chamada de uma sala.
- Microfone com cancelamento de eco, supressão de ruído e ganho automático.
- Mutar microfone; ensurdecer (parar de ouvir todos).
- Volume por participante e silenciar localmente.
- Indicador de quem está falando.
- Escolha de dispositivo de entrada e de saída.
- Modo só ouvir.

### 3.2 Chat de texto

- Mensagens de texto na sala, entregues a quem está online.
- Mensagens de sistema (entrou, saiu, começou a transmitir).
- **Efêmero:** sem histórico. Quem entra depois não vê mensagens antigas.

### 3.3 Transmissão de tela

- Compartilhar tela inteira ou uma janela.
- Som do sistema junto, como faixa de áudio separada da voz, sem capturar o áudio do próprio Xorachat (evita devolver a voz dos amigos).
- Mais de uma pessoa pode transmitir ao mesmo tempo; cada espectador escolhe o que assistir.
- **Assistir sob demanda:** o vídeo só é baixado e decodificado por quem clicou para assistir.
- Predefinições de qualidade: 720p/30 (padrão), 1080p/30 e 1080p/60.
- Volume da transmissão independente do volume das vozes.

### 3.4 Sala, acesso e aplicativo

- Entrada com apelido + nome da sala + código de convite. Sem contas.
- Minimizar para a bandeja e continuar na chamada.
- Com a janela oculta, o app para de desenhar a interface e cancela a assinatura dos vídeos.
- Configurações salvas localmente (apelido, dispositivos, volumes, última sala).

### 3.5 Fora do MVP

Contas e banco de dados · histórico de mensagens · webcam · envio de arquivos e imagens · mobile e macOS · criptografia ponta a ponta · várias salas simultâneas · atalho global de mutar no Wayland · atualização automática · gravação.

### 3.6 Metas de leveza

São metas a validar na Fase 0, não medições.

| Situação | Meta |
|---|---|
| Em chamada de voz, janela oculta | CPU próxima de zero; memória abaixo de 150 MB |
| Transmitindo 720p/30 com encoder por hardware | Queda de FPS no jogo imperceptível |
| Transmitindo com encoder por software | Medir; se pesar, antecipar o item 8.1 |

## 4. Arquitetura

```
 ┌───────────── Cliente Xorachat (Rust) ─────────────┐
 │  Interface (egui)   Bandeja   Configurações       │
 │        │                                          │
 │  Núcleo da sessão ── estado da sala, eventos      │
 │        │                                          │
 │  Mídia: microfone/saída · captura de tela ·       │
 │         som do sistema · codificação              │
 └───────┬───────────────────────────┬───────────────┘
         │ 1. HTTPS: pede token      │ 2. WebRTC (áudio, vídeo, dados)
         ▼                           ▼
 ┌──────────────────── VPS ─────────────────────────┐
 │  Caddy (TLS)                                     │
 │   ├─ xora-token  (Rust)  valida convite → token  │
 │   └─ livekit-server (SFU + TURN)                 │
 └──────────────────────────────────────────────────┘
```

**Fluxo de entrada.** O cliente envia apelido, sala e código de convite ao `xora-token`. Se o código confere, recebe a URL do servidor e um token assinado, e conecta ao SFU. A chave secreta do servidor nunca vai para o cliente.

**Faixas publicadas por participante.**

| Faixa | Conteúdo | Observação |
|---|---|---|
| `mic` | Voz | Mono, com cancelamento de eco, ruído e ganho |
| `screen` | Vídeo da tela | Uma camada só (sem simulcast) no MVP |
| `screen-audio` | Som do sistema | Estéreo, sem filtros de voz, bitrate maior |
| dados | Chat de texto | Fluxo de texto no tópico `chat` |

Presença, entrada e saída, e "quem está falando" vêm dos eventos do próprio servidor; o cliente não precisa de protocolo próprio.

## 5. Stack técnica

### 5.1 Cliente (Rust)

A peça central é o **SDK Rust do LiveKit** (`livekit`), que embute a `libwebrtc`. Ele cobre sozinho a maior parte do MVP, então a lista de bibliotecas extras é curta.

| Necessidade | Solução | Biblioteca extra? |
|---|---|---|
| Conexão, sala, presença, faixas | `livekit` 0.9.4 | — |
| Codec de voz (Opus), jitter, controle de banda | embutido na `libwebrtc` | Não |
| Microfone e alto-falante, escolha de dispositivo | `livekit::PlatformAudio` (WASAPI no Windows; PulseAudio/ALSA no Linux) | Não |
| Eco, ruído, ganho | `PlatformAudio::configure_audio_processing` | Não |
| Quem está falando | evento `ActiveSpeakersChanged` | Não |
| Chat de texto | `send_text` / fluxos de texto do SDK | Não |
| Captura de tela e janela | `livekit::webrtc::desktop_capturer` (WGC/DirectX no Windows; X11 e portal PipeWire no Wayland) | Não. No Linux, ativar a feature `glib-main-loop` |
| Codificação de vídeo | `libwebrtc`: VP8, VP9, AV1 e H.264 por software; por hardware, ver 8.1 | Não no MVP |
| Som do sistema — Windows | Loopback excluindo o próprio processo | **Sim:** `wasapi` 0.26 |
| Som do sistema — Linux | Captura de nós do PipeWire, excluindo o próprio app | **Sim:** `pipewire` 0.10 |
| Runtime assíncrono | exigido pelo SDK | **Sim:** `tokio` 1.x |
| Interface e renderização de vídeo | `egui` com backend `wgpu` | **Sim:** `eframe`, `egui`, `egui-wgpu` 0.36 |
| Bandeja do sistema | | **Sim:** `tray-icon` 0.26 (alternativa no Linux: `ksni` 0.3, sem GTK) |
| Atalho global (mutar) | Windows e X11 | **Sim:** `global-hotkey` 0.8 |
| Pedir o token | | **Sim:** `livekit-token-source` 0.1 (ou `reqwest`) |
| Configurações locais | | **Sim:** `serde`, `toml`, `directories` |
| Logs e erros | | **Sim:** `tracing`, `tracing-subscriber`, `anyhow`, `thiserror` |

**Por que `egui`.** Os exemplos oficiais do SDK (`examples/local_video`) e o cliente de referência `livekit-examples/rust-dev-client` já renderizam vídeo do LiveKit com `egui` + `wgpu`, o que dá um ponto de partida testado. Ele só redesenha quando há evento, o que ajuda no uso em segundo plano.

**Reaproveitamento.** Os exemplos `screensharing`, `local_audio` e `local_video` do repositório `livekit/rust-sdks` cobrem, separadamente, as três partes de mídia do MVP.

### 5.2 Servidor

| Peça | Tecnologia | Papel |
|---|---|---|
| SFU + TURN | `livekit-server` 1.13 (binário pronto, em Go; não escrevemos) | Recebe e redistribui áudio, vídeo e dados |
| Serviço de token | `xora-token`: Rust com `axum` 0.8 + `livekit-api` 0.8 | Valida o código de convite e emite o token da sala |
| TLS e proxy | Caddy | Certificado automático |
| Implantação | Docker Compose gerado pela ferramenta `livekit/generate` | Sobe tudo em uma VM |

Não há banco de dados. O estado da sala vive na memória do SFU, e o código de convite e as chaves ficam em variáveis de ambiente.

### 5.3 Build e distribuição

| Alvo | Formato | Ferramenta |
|---|---|---|
| Windows x86_64 | `.zip` portátil no MVP; instalador depois | `cargo build` (MSVC, `+crt-static`, exigido pelo SDK) |
| Debian | `.deb` | `cargo-deb` |
| Fedora | `.rpm` | `cargo-generate-rpm` |

- **CI:** GitHub Actions com matriz Windows + Linux, publicando os pacotes em uma release por tag.
- **Linux — dependências de build** (lista do CI do SDK): `libasound2-dev`, `libssl-dev`, `libx11-dev`, `libgl1-mesa-dev`, `libxext-dev`, `libdrm-dev`, `libgbm-dev`, `libxfixes-dev`, `libxdamage-dev`, `libxrandr-dev`, `libxcomposite-dev`, `libglib2.0-dev`, `protoc` e **clang 21 ou mais novo**. Somam-se `libpipewire-0.3-dev` (som do sistema) e, para encoder por hardware, `libva-dev` e os cabeçalhos CUDA.
- **Compatibilidade:** compilar o binário Linux na distribuição mais antiga suportada (Debian estável), para rodar também no Fedora.

## 6. Estrutura do repositório

```
xorachat/
├─ Cargo.toml                # workspace
├─ rust-toolchain.toml       # versão fixa do Rust
├─ .cargo/config.toml        # rustflags exigidas pelo SDK
├─ crates/
│  ├─ xora-core/             # sessão LiveKit, estado da sala, eventos (sem UI)
│  ├─ xora-media/            # captura de tela e som do sistema, por SO
│  │  └─ src/{windows,linux}/
│  ├─ xora-app/              # binário desktop: egui, bandeja, configurações
│  └─ xora-token/            # binário do servidor: axum + livekit-api
├─ deploy/                   # docker-compose, Caddyfile, livekit.yaml
├─ packaging/                # metadados .deb/.rpm, ícones, Windows
├─ docs/
│  └─ PROJETO.md             # este documento
├─ legacy/                   # index.html e xorachat-desktop atuais
└─ .github/workflows/        # build e release
```

**Regra de dependência:** `xora-app` → `xora-core` → `xora-media`. O código específico de sistema operacional fica isolado em `xora-media`, e `xora-core` não conhece a interface, o que permite testá-lo com um cliente de linha de comando.

## 7. Hospedagem gratuita

**Opção A — Oracle Cloud Always Free (preferida).**

| Item | Valor (documentação da Oracle em 11/10/2026) |
|---|---|
| Instância ARM (Ampere A1) | 2 OCPUs e 12 GB de RAM |
| Tráfego de saída | 10 TB por mês |
| Região | Somente a "home region" da conta (escolher São Paulo no cadastro) |

- O `livekit-server` tem build oficial para ARM64.
- A 4 Mbps por espectador, 4 espectadores consomem cerca de 7 GB por hora; 10 TB cobrem mais de mil horas por mês.
- **Ressalvas:** exige cartão de crédito no cadastro; a Oracle pode recuperar instâncias ociosas (CPU, rede e memória abaixo de 20% por 7 dias), e um servidor usado poucas horas por semana se encaixa nisso; pode faltar capacidade ARM na região.
- **Domínio:** a documentação do LiveKit pede um domínio próprio apontando para a VM (um nome para o servidor e outro para o TURN). Um subdomínio gratuito deve servir; a confirmar na Fase 0.
- **Portas:** TCP 80, 443 e 7881; UDP 3478 e 50000–60000.

**Opção B — LiveKit Cloud, plano gratuito.** 5.000 minutos de participante e 50 GB de tráfego por mês. Serve para validar sem montar servidor, mas 50 GB dão cerca de 7 horas de transmissão para 4 espectadores. O `xora-token` ainda precisa ser hospedado em algum lugar.

**Opção C — servidor na casa de um amigo.** Custo zero, mas depende de IP público e redirecionamento de portas; não funciona atrás de CGNAT.

## 8. Riscos e pontos em aberto

### 8.1 Encoder por hardware no Windows (risco principal)

O README do SDK lista codificação por hardware apenas para macOS, Linux com NVIDIA, Linux com AMD (VA-API) e Jetson. **No Windows a codificação é por software (CPU)**, justamente a plataforma onde a maioria joga. Intel no Linux não aparece na lista.

- **MVP:** transmitir em 720p/30 por software e medir o impacto em um jogo real.
- **Se pesar:** usar o caminho de vídeo pré-codificado do crate `livekit-capture` (`EncodedVideoSource`), alimentado por um encoder de hardware próprio (NVENC, AMF, Quick Sync ou Media Foundation, por exemplo via GStreamer). O crate está em "Developer Preview".
- Esta medição é o primeiro item da Fase 0, porque pode mudar a ordem do trabalho.

### 8.2 Outros riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Build pesado do SDK (baixa `libwebrtc` pré-compilada, exige clang recente) | Tempo de CI e de configuração | Validar o build nas três plataformas antes de qualquer feature |
| Wayland: captura passa pelo seletor do sistema; sem atalho global | Experiência diferente do Windows | Aceitar no MVP; atalho via portal depois |
| Bandeja no GNOME depende de extensão | Fedora Workstation pode não mostrar o ícone | Manter também "minimizar" comum |
| Captura de áudio por processo no Windows exige Windows 10 recente (API de "process loopback") | Em versões antigas não há como excluir o próprio app | Alternativa: loopback do sistema inteiro, com aviso para usar fones |
| Som do sistema no Linux exige PipeWire | Sistemas só com PulseAudio | Alternativa: fonte monitor via `pactl`, como no app atual |
| VPS gratuita recuperada ou indisponível | App fora do ar | Implantação reproduzível em `deploy/`; opção B como reserva |
| Código de convite único e compartilhado | Quem vazar o código dá acesso | Trocar o código exige só reiniciar o `xora-token` |

### 8.3 Decisões pendentes

1. Uma sala fixa para o grupo ou várias salas por nome?
2. Quais GPUs o grupo usa (NVIDIA, AMD, Intel) e em qual sistema? Define a prioridade do item 8.1.
3. Quem cria a conta da VPS e registra o domínio?

## 9. Fases

| Fase | Entrega | Critério de pronto |
|---|---|---|
| **0 — Validação** | Build do SDK em Windows, Fedora e Debian; servidor no ar; teste de transmissão com medição de CPU/GPU em jogo; captura de som do sistema sem eco | Números do item 3.6 medidos e decisão sobre 8.1 |
| **1 — Voz** | Entrar na sala, falar e ouvir, mutar, volumes, indicador de fala, dispositivos | Chamada estável entre Windows e Linux |
| **2 — Texto** | Chat da sala e mensagens de sistema | Mensagens entregues a todos os online |
| **3 — Transmissão** | Tela ou janela + som do sistema, assistir sob demanda, predefinições | Jogo transmitido com som, sem eco |
| **4 — Acabamento** | Bandeja, segundo plano, configurações, pacotes `.zip`, `.deb`, `.rpm` | Amigos instalam e usam sem ajuda |

## 10. Referências

- SDK Rust do LiveKit: <https://github.com/livekit/rust-sdks> (exemplos `screensharing`, `local_audio`, `local_video`; crate `livekit-capture`)
- Cliente de referência com egui: <https://github.com/livekit-examples/rust-dev-client>
- Servidor LiveKit: <https://github.com/livekit/livekit>
- Hospedagem própria do LiveKit em VM: <https://docs.livekit.io/home/self-hosting/vm/>
- Preços do LiveKit Cloud: <https://livekit.com/pricing>
- Oracle Cloud, recursos Always Free: <https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm>
- Crate `wasapi`: <https://docs.rs/wasapi>
- Repositório de origem: <https://github.com/wendeltc/Xorachat>
