import type { StudyPlan } from './model';

export const samplePlan: StudyPlan = {
  name: 'Business Informatics',
  institution: 'Illustrative sample · replace with your official study plan',
  modules: [
    { id: 'logic', title: 'Logic & Discrete Structures', code: 'WI-101', semester: 1, ects: 5, status: 'completed', category: 'Foundations', description: 'A sample introduction to formal reasoning, sets, relations, and discrete structures.' },
    { id: 'micro', title: 'Economics I: Microeconomics', code: 'WI-102', semester: 1, ects: 5, status: 'completed', category: 'Business', description: 'A sample introduction to individual decisions, markets, and incentives.' },
    { id: 'intro-wi', title: 'Introduction to Business Informatics', code: 'WI-103', semester: 1, ects: 5, status: 'in-progress', category: 'Core', description: 'How information systems connect business processes, data, and technology.' },
    { id: 'accounting', title: 'Financial Accounting', code: 'WI-104', semester: 1, ects: 5, status: 'not-started', category: 'Business', description: 'A sample overview of financial statements and accounting fundamentals.' },
    { id: 'algorithms', title: 'Algorithms & Data Structures', code: 'WI-201', semester: 2, ects: 6, status: 'not-started', category: 'Computer science', description: 'Core algorithmic techniques, data structures, and complexity.' },
    { id: 'software', title: 'Introduction to Software Engineering', code: 'WI-202', semester: 2, ects: 5, status: 'not-started', category: 'Computer science', description: 'Requirements, design, implementation, testing, and collaborative development.' },
    { id: 'economics-2', title: 'Economics II', code: 'WI-203', semester: 2, ects: 5, status: 'not-started', category: 'Business', description: 'A sample continuation of economic models and analysis.' },
    { id: 'society', title: 'Technology, Business & Society', code: 'WI-204', semester: 2, ects: 3, status: 'not-started', category: 'Context', description: 'Explore how technology and business affect people and institutions.' },
    { id: 'databases', title: 'Databases', code: 'WI-301', semester: 3, ects: 5, status: 'not-started', category: 'Computer science', description: 'Data modelling, relational databases, and querying.' },
    { id: 'finance', title: 'Investment & Financial Management', code: 'WI-302', semester: 3, ects: 5, status: 'not-started', category: 'Business', description: 'A sample introduction to investment decisions and financial management.' },
    { id: 'functional', title: 'Functional Programming & Verification', code: 'WI-303', semester: 3, ects: 5, status: 'not-started', category: 'Computer science', description: 'Functional programming concepts, reasoning about programs, and verification.' },
    { id: 'networks', title: 'Networks & Distributed Systems', code: 'WI-401', semester: 4, ects: 5, status: 'not-started', category: 'Computer science', description: 'Network architecture, protocols, and distributed applications.' },
  ],
  dependencies: [
    { id: 'd1', source: 'logic', target: 'algorithms', kind: 'recommended', provenance: 'illustrative', note: 'Discrete reasoning is useful preparation.' },
    { id: 'd2', source: 'intro-wi', target: 'software', kind: 'recommended', provenance: 'illustrative', note: 'Conceptual context for information systems.' },
    { id: 'd3', source: 'algorithms', target: 'databases', kind: 'recommended', provenance: 'illustrative', note: 'Useful programming and problem-solving background.' },
    { id: 'd4', source: 'software', target: 'databases', kind: 'recommended', provenance: 'illustrative', note: 'Software design concepts can help.' },
    { id: 'd5', source: 'algorithms', target: 'functional', kind: 'recommended', provenance: 'illustrative', note: 'Prior programming experience is useful.' },
    { id: 'd6', source: 'logic', target: 'functional', kind: 'recommended', provenance: 'illustrative', note: 'Formal reasoning can help with verification.' },
    { id: 'd7', source: 'intro-wi', target: 'finance', kind: 'recommended', provenance: 'illustrative', note: 'Business context is helpful.' },
    { id: 'd8', source: 'software', target: 'networks', kind: 'recommended', provenance: 'illustrative', note: 'Software architecture context is helpful.' },
    { id: 'd9', source: 'algorithms', target: 'networks', kind: 'recommended', provenance: 'illustrative', note: 'Programming background is helpful.' },
  ],
};
