# Xorachat Desktop (Linux, AppImage)

App com o seu `index.html` dentro de um Electron. Ao abrir, ele cria sozinho a fonte
**SomDoSistema** (espelho da sua saída de áudio). Ao compartilhar a tela, o som do sistema
é ligado automaticamente — nada de terminal para quem usa.

## Gerar o AppImage

### Opção A — na nuvem (GitHub Actions)
Veja as instruções que vieram na conversa: o arquivo `.github/workflows/build.yml` fica na RAIZ do repositório, não aqui dentro.

### Opção B — na sua máquina
```
npm install
npm run dist       # gera dist/Xorachat-1.0.0-x86_64.AppImage
npm start          # só para testar sem empacotar
```

## Para seus amigos usarem
Baixar o `.AppImage` → botão direito → Propriedades → *Permitir executar como programa* → duplo clique.

## Se algo der errado
- **Não abre no Ubuntu 22.04+:** falta o FUSE 2 (`libfuse2`; no Ubuntu 24.04 é `libfuse2t64`).
- **Sem som do sistema:** o app precisa do `pactl` (pacote `pulseaudio-utils`; no Arch `libpulse`).
  O app avisa no chat se não encontrar.
- **Trocou de fone/caixa durante a tela:** pare e inicie o compartilhamento de novo.
- **Eco (amigos se ouvem):** use fones. O app liga o cancelamento de eco do navegador na captura do sistema.

## Windows / Mac
Não precisa deste app: a versão web já captura o som do sistema pelo Chrome.
