export default {
  "*.{js,mjs,cjs}": [
    "eslint --fix --max-warnings 0 --no-warn-ignored",
    "prettier --write",
  ],
  "*.{json,md,yml,yaml,html,css}": "prettier --write",
};
