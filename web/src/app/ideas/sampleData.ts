// Shared sample content for the /ideas/* interactive mockups. Inline so
// each preview renders identically and doesn't depend on DB state.

export const SAMPLE = {
  category: 'Politics',
  sources: ['NYT', 'Reuters', 'BBC'],
  title: 'Supreme Court narrowly upholds federal wiretap framework',
  byline: 'By Verity Editorial',
  readMinutes: 4,
  published: 'April 20, 2026',
  lede: 'In a 5-4 decision issued Tuesday, the Court left in place the statutory framework that has governed federal wiretaps for two decades, declining to adopt the sweeping Fourth Amendment arguments raised by a coalition of civil-liberties groups.',
  body: [
    'Writing for the majority, Chief Justice Roberts said the framework\u2019s "long-standing judicial and congressional oversight" continued to provide the constitutional balance the petitioners sought to overturn. The ruling does not modify the underlying statute; it affirms a lower-court interpretation that narrowed the circumstances under which evidence gathered under the framework can be challenged at trial.',
    'The decision turns on a narrow procedural question: whether defendants in federal criminal cases may seek pre-trial disclosure of the specific statutory authority cited by the government when applying for a wiretap. The majority answered no, holding that existing disclosure rules already satisfy due-process requirements.',
    'In dissent, Justice Kagan argued that the ruling "quietly forecloses an avenue of scrutiny that every other branch of government has relied on to check executive surveillance power." She was joined by Justices Sotomayor, Jackson, and Barrett \u2014 an unusual cross-ideological alignment that civil-liberties scholars noted immediately.',
    'The ruling leaves intact the statute\u2019s sunset provision, which is set to expire in 2027 absent congressional reauthorization. Committee leaders in both chambers have signaled that the reauthorization debate will now move forward without the constitutional overhang the case might have provided.',
  ],
  sampleComments: [
    {
      author: '@liz_22',
      verity: 148,
      when: '2h ago',
      text: 'The framing here misses that Justice Kagan\u2019s dissent hinged on procedural scrutiny, not substantive Fourth Amendment doctrine. That matters for how the 2027 reauthorization fight plays out \u2014 Congress can\u2019t lean on the Court to do its oversight work anymore.',
    },
    {
      author: '@m_jackson',
      verity: 87,
      when: '4h ago',
      text: 'Worth reading the underlying Ninth Circuit opinion if you want to understand how narrow this actually is. The Court didn\u2019t reach the Fourth Amendment question at all.',
    },
    {
      author: '@quiet_reader',
      verity: 203,
      when: '5h ago',
      text: 'One thing the majority did signal, almost in passing, is that it sees the sunset provision as doing constitutional work. That\u2019s a subtle but important reframe \u2014 the statute\u2019s expiration becomes part of the due-process calculus.',
    },
  ],
};

export const HEADLINES = [
  {
    title: 'Supreme Court narrowly upholds federal wiretap framework',
    category: 'Politics',
    minutes: 4,
    sources: 3,
  },
  {
    title: 'Chinese AI regulation tightens after second deepfake election incident',
    category: 'World',
    minutes: 6,
    sources: 5,
  },
  {
    title: 'European grid operators warn of winter capacity strain despite record renewables',
    category: 'Business',
    minutes: 5,
    sources: 4,
  },
  {
    title: 'CDC reverses guidance on at-home respiratory tests citing false-negative rate',
    category: 'Health',
    minutes: 3,
    sources: 2,
  },
  {
    title: 'Shipping coalition announces binding 2030 emissions target in Rotterdam',
    category: 'Environment',
    minutes: 5,
    sources: 4,
  },
  {
    title: 'Federal judge dismisses antitrust case against regional airline alliance',
    category: 'Business',
    minutes: 4,
    sources: 3,
  },
  {
    title: 'First confirmed detection of a planetary atmosphere around a rogue exoplanet',
    category: 'Science',
    minutes: 7,
    sources: 5,
  },
  {
    title: 'Mexico City water crisis deepens as reservoir reaches record low',
    category: 'World',
    minutes: 5,
    sources: 4,
  },
];

export const TYPOGRAPHY = {
  bg: '#ffffff',
  text: '#111111',
  dim: '#666666',
  border: '#e5e5e5',
  accent: '#111111',
  rule: '#d9d9d9',
  serif: 'var(--font-source-serif), Georgia, "Times New Roman", serif',
  sans: 'var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};
