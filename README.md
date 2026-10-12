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
- `semanaPadrao` e `semanaVariante`: o que cai em cada dia.
- `semanas`: fase, séries, tiros, longão e condicionamento de cada semana.

## Publicar uma versão nova

Mude `VERSAO` em `sw.js` para o celular baixar os arquivos novos.
