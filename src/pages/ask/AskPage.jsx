import { createElement as h, useState } from 'react';
import { useAsk } from './useAsk.js';
import { AskDossier } from './AskDossier.jsx';
import './askPage.css';

const EXAMPLES = [
  'What is Charizard ex from the 151 set (card 006), the equivalent Japanese card, and what is it worth?',
  'I have a Japanese リザードンex from Pokémon Card 151 — what English card does it correspond to?',
  'Is Surging Sparks #100 (sv08) the same card as the Japanese SV8 #100?',
  'What is my collection worth?',
];

export default function AskPage() {
  const [input, setInput] = useState('');
  const { status, result, error, ask, reset, history } = useAsk();
  const loading = status === 'loading';

  const submit = (e) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;
    ask(input);
    setInput('');
  };

  return h('main', { className: 'ask-page' },
    h('header', { className: 'ask-head' },
      h('a', { href: '/', className: 'ask-back' }, '← DraGold'),
      h('h1', null, 'Ask DraGold'),
      h('p', { className: 'ask-tag' },
        'Answers grounded in the DraGold knowledge layer — identity, EN↔JA, and market values that come from tools, with sources and confidence. The model does not invent data.'),
    ),

    history.length > 0 ? h('div', { className: 'ask-thread' },
      history.map((m, i) => h('div', { key: i, className: `ask-msg ask-msg-${m.role}` },
        m.role === 'user' ? h('p', { className: 'ask-q' }, m.content) : null))) : null,

    loading ? h('div', { className: 'ask-loading' },
      h('span', { className: 'ask-spinner' }), ' Working through the tools…') : null,

    error ? h('div', { className: 'ask-error' }, error) : null,

    status === 'done' && result ? h(AskDossier, { result }) : null,

    h('form', { className: 'ask-form', onSubmit: submit },
      h('textarea', {
        className: 'ask-input',
        value: input,
        placeholder: 'Ask about a card, its Japanese version, its value, or your collection…',
        rows: 2,
        onChange: (e) => setInput(e.target.value),
        onKeyDown: (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e); },
        disabled: loading,
      }),
      h('div', { className: 'ask-actions' },
        history.length > 0 ? h('button', { type: 'button', className: 'ask-btn-ghost', onClick: reset }, 'New conversation') : h('span', null),
        h('button', { type: 'submit', className: 'ask-btn', disabled: loading || !input.trim() }, loading ? 'Asking…' : 'Ask'),
      )),

    status === 'idle' ? h('div', { className: 'ask-examples' },
      h('p', null, 'Try:'),
      EXAMPLES.map((ex, i) => h('button', { key: i, className: 'ask-example', onClick: () => ask(ex) }, ex)),
    ) : null,
  );
}
