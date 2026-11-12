# Tiebreak

Web app de treinos (força, corrida e tênis) para instalar na tela de início do celular.

- Funciona offline depois da primeira abertura.
- Os registros ficam só no aparelho. Backup e restauração por arquivo JSON, em Ajustes.
- O plano de treino fica em `plano.json`, separado do código. Outro plano pode ser carregado pelo app, em Ajustes → Carregar plano.

## Instalar no iPhone

1. Abra o link do app no Safari.
2. Toque em Compartilhar → Adicionar à Tela de Início.

## Formato do plano

`plano.json` (formato `tiebreak-plano/1`):

- `exercicios`: cada exercício tem um código fixo (por exemplo `supino-halteres`), com execução, erros comuns e alternativas. O histórico de carga segue o código, então o mesmo código em outro plano continua o histórico.
- `sessoes`: treinos de força (blocos simples ou bi-sets), corridas, tênis, descanso.
- `semanaPadrao` e `semanaVariante`: o que cai em cada dia. Um dia com `alternar` (por exemplo `["inf2", "inf1"]`) recebe o treino da lista feito há mais tempo.
- `opcoesSemana` (opcional): outras semanas padrão para escolher em Ajustes, como o dia de descanso. A escolha fica só no aparelho.
- `semanas`: fase, séries, tiros, longão e condicionamento de cada semana. Uma semana com `dias` usa a própria ordem, o que preserva o histórico quando a semana padrão muda.

## Sugestões

O app nunca muda o plano sozinho. Quando um treino é trocado, ele recalcula os próximos 7 dias em cascata (cada sugestão aceita muda as seguintes) e mostra o que trocar, com o motivo: treino já feito na semana, dois fortes seguidos, perna na véspera de tiros ou jogo, mesmo grupo em menos de 48 h, ou 6 dias seguidos sem descanso. Também mostra o que evitar hoje e amanhã.

## Publicar uma versão nova

Mude `VERSAO` em `sw.js` para o celular baixar os arquivos novos.

## Segurança

- O app não carrega nada de fora: fontes e ícones ficam no repositório, e a política de segurança (CSP) em `index.html` bloqueia scripts, estilos e conexões de outros endereços.
- Os registros ficam só no aparelho. Nada de dados pessoais, horários ou locais vai para este repositório.
- Fontes: Barlow Condensed e IBM Plex, sob a SIL Open Font License 1.1 (ver `fonts/`).
