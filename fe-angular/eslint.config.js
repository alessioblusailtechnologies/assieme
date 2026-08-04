// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: ['app', 'ui'],
          style: 'camelCase',
        },
      ],
      /*
       * Due prefissi, con significati diversi.
       *
       * `ui-` sono le primitive di `shared/ui`: non sanno nulla del dominio
       * assicurativo, non fanno chiamate, si possono usare ovunque. `app-`
       * è tutto il resto — struttura e funzionalità, che il dominio lo
       * conoscono eccome.
       *
       * La distinzione si legge dal markup senza aprire un file: `<ui-icon>`
       * si può spostare in qualsiasi schermata, `<app-barra-laterale>` no.
       */
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: ['app', 'ui'],
          style: 'kebab-case',
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
