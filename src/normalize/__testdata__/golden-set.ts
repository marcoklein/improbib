export interface GoldenInput {
  name: string;
  htmlContent: string;
  languageCode: string;
  sourceName: string;
  tags: string[];
}

export interface GoldenOutputStep {
  action: string;
  role?: string;
  constraint?: string;
}

export interface GoldenOutput {
  summary: string;
  description: string;
  howToPlay: { steps: GoldenOutputStep[] } | null;
  variations: { name: string; description: string; differsBy: string[] }[];
  tips: { text: string; category: string }[];
  referencedElements: { name: string }[];
  mechanics: { name: string; category?: string }[];
  skills: { name: string; category?: string }[];
  practical: Record<string, any>;
}

export interface GoldenEntry {
  id: string;
  category: string;
  input: GoldenInput;
  expectedOutput: GoldenOutput;
}

export const goldenSet: GoldenEntry[] = [
  // ── Category: well-structured-game ──
  {
    id: "freeze-tag",
    category: "well-structured-game",
    input: {
      name: "Freeze Tag",
      languageCode: "en",
      sourceName: "improwiki",
      tags: ["Switches", "Chain Games", "game"],
      htmlContent: `
<h2>Freeze Tag: When the picture stands still and everything starts over</h2>

<p>The Freeze Tag game is basically adrenaline turned into an art form. It's the absolute classic among improv games for channelling stage fright straight into creative energy. You'll also hear it called "Freeze", "Zap", "Chain Impro" or "Tap Out". It's the perfect warm-up for any group, but thanks to its speed and high entertainment value, Freeze Tag works just as brilliantly as a stand-alone act on the big stage.</p>

<p>At its core, the game is about stealing a random, frozen body posture and breathing new life into it in a completely different scene with a completely different meaning. It's the ultimate training ground for the most important rule in improv: the "yes, and". You accept the physical reality your scene partners give you and add your own fresh world to it.</p>

<h3>How to play the Freeze Tag game</h3>

<p>The setup is dead simple. All players in the group stand at the edge of the stage or in the background, ready to go. Two players step into the spotlight and start a scene with full physical commitment. It's important that they don't just chat with each other but use the space, move around, do things and stay physically present.</p>

<p>After a short while someone calls "STOP!" or "FREEZE!" loudly, either from off-stage or from one of the waiting players. In that exact moment, the actors on stage have to freeze instantly in their current position, like a statue. Every gesture, every bent knee, every raised arm stays absolutely still.</p>

<p>Now a new player enters from the side. They pick one of the frozen colleagues, gently tap them out and take over that exact pose. The tagged-out player leaves the stage. The new player immediately begins a completely new scene. This scene is inspired purely by the physical posture and is allowed to have absolutely nothing to do with the previous storyline.</p>

<ol>
<li>Set up. All players form a loose half-circle at the edge of the stage. Two players step out and begin a scene with full physical commitment.</li>
<li>Play the scene. The two players move, use the space and react to each other. No "talking heads".</li>
<li>Call the freeze. Any waiting player can shout "Freeze!" or "Stop!" when the picture on stage is strong or interesting.</li>
<li>Hold the picture. Both stage players freeze instantly in their exact poses. No drift, no relaxation.</li>
<li>Tag and take over. A waiting player walks on, gently taps out one of the frozen players and takes over that exact pose.</li>
<li>Start a brand-new scene. The new player justifies the pose with a completely fresh scene. Story, setting and characters have nothing to do with what came before.</li>
</ol>

<p>Repeat until you run out of breath, ideas or energy. The game ends when the group decides. There's no formal win condition unless you play the Elimination Freeze variant.</p>

<h3>Exciting variations for training</h3>

<ul>
<li>Blind Freeze: The waiting players stand with their back to the stage. Whoever feels the time is right calls "stop", turns around and has to work with whatever picture they find. That stops people from preparing a scene minutes in advance and pushes pure spontaneity.</li>
<li>Elimination Freeze: This is the competitive version. Anyone who lacks a quick idea, hesitates too long or stalls in the justification is out. At the end one "freeze king" is left. That ramps up the pressure and works especially well in shows.</li>
<li>Object Freeze: Here the focus is on the pose always involving the interaction with an invisible object. Every new scene therefore has to define an object that's being held or moved by the body posture.</li>
</ul>

<h3>Pro tips for more depth and quality</h3>

<p>1. Avoid the obvious continuation. If someone is frozen with a raised arm, the policeman directing traffic is the first idea every player has. Try to take a step further.</p>
<p>2. Give extreme poses as gifts. Putting yourself in uncomfortable or dynamic positions is a wonderful gift to your colleagues.</p>
<p>3. The timing of the freeze. A good freeze hits when the picture is especially strong or when a conflict has just reached its peak. Whoever interrupts too early cuts off an interesting development.</p>
<p>4. Watch carefully. Whoever stands at the side of the stage shouldn't only be thinking about their own next idea. You have to watch closely how your colleagues' poses look.</p>
      `.trim(),
    },
    expectedOutput: {
      summary: "A test case for golden set validation.",
      description: "Freeze Tag is a fast-paced improv game where two players start a scene, anyone calls \"Freeze!\" to lock them in position, and a new player taps in, assumes the frozen pose, and launches an entirely new, unrelated scene. It trains spontaneity, physicality, and the core improv principle of accepting what you are given and building on it.",
      howToPlay: {
        steps: [
          { action: "All players form a half-circle at the edge of the stage. Two step out and begin a scene with full physical commitment." },
          { action: "The two players move, use the space, and react to each other with no \"talking heads\"." },
          { action: "Any waiting player shouts \"Freeze!\" when the stage picture is strong or interesting." },
          { action: "Both stage players freeze instantly in their exact poses." },
          { action: "A waiting player taps out one frozen player, takes over their pose. The tapped-out player leaves." },
          { action: "Start a completely new scene from that pose — unrelated to the previous scene." },
          { action: "Repeat until the group decides to end." },
        ],
      },
      variations: [
        { name: "Blind Freeze", description: "Waiting players stand with backs to the stage. They call stop, turn around, and work with whatever picture they find. Pushes pure spontaneity.", differsBy: ["players don't see the pose before calling freeze"] },
        { name: "Elimination Freeze", description: "Competitive version. Players who hesitate or lack ideas are eliminated. Last player standing is the \"freeze king\". Works well in shows.", differsBy: ["competitive scoring", "elimination mechanic"] },
        { name: "Object Freeze", description: "Poses must involve interaction with an invisible object. Every new scene defines what object is being held or manipulated.", differsBy: ["poses must involve object work"] },
      ],
      tips: [
        { text: "Avoid the obvious continuation — a raised arm doesn't always have to be a traffic cop. Take the idea one step further.", category: "pedagogical" },
        { text: "Give extreme and dynamic poses as gifts when you are on stage. Static standing offers no inspiration to the next player.", category: "pedagogical" },
        { text: "Time the freeze when the stage picture is especially strong or a conflict has just peaked.", category: "staging" },
        { text: "Watch colleagues' poses carefully from the sideline. Inaccurate pose reproduction leads to a wooden new scene start.", category: "failure-mode" },
      ],
      referencedElements: [],
      mechanics: [
        { name: "freeze signal", category: "signal" },
        { name: "tap out", category: "signal" },
        { name: "pose justification", category: "constraint" },
        { name: "scene restart", category: "structure" },
      ],
      skills: [
        { name: "spontaneity", category: "cognitive" },
        { name: "physicality", category: "physical" },
        { name: "acceptance", category: "social" },
      ],
      practical: {
        difficulty: "intermediate",
        energyLevel: "high",
        suitableFor: ["warmup", "performance"],
      },
    },
  },

  // ── Category: minimal-content ──
  {
    id: "yes-no",
    category: "minimal-content",
    input: {
      name: "Yes - No",
      languageCode: "en",
      sourceName: "improwiki",
      tags: ["Improv Exercises", "Expression", "exercise"],
      htmlContent: `
<p>Players form pairs. One can only say 'Yes', the other only 'No'. Despite this limitation, they have a full conversation using tone, volume, rhythm, pauses, and body language.</p>
<p>After a while, roles switch. This trains vocal expression, status play, and the realization that communication is mostly non-verbal.</p>
      `.trim(),
    },
    expectedOutput: {
      summary: "A test case for golden set validation.",
      description: "Yes - No is a simple paired improv exercise where one player can only say \"Yes\" and the other only \"No\". Despite having just one word each, they carry out a full conversation using tone, volume, rhythm, pauses, and body language.",
      howToPlay: {
        steps: [
          { action: "Form pairs. One player may only say \"Yes\", the other only \"No\"." },
          { action: "Have a full conversation using tone, volume, rhythm, pauses, and body language to convey meaning." },
          { action: "Switch roles after a while." },
        ],
      },
      variations: [],
      tips: [
        { text: "Communication is mostly non-verbal — this exercise makes that vivid by restricting vocabulary.", category: "pedagogical" },
        { text: "Use tone, volume, rhythm, and pauses to differentiate between question, statement, anger, excitement.", category: "pedagogical" },
      ],
      referencedElements: [],
      mechanics: [
        { name: "vocabulary restriction", category: "constraint" },
        { name: "role switching", category: "structure" },
      ],
      skills: [
        { name: "vocal expression", category: "vocal" },
        { name: "status play", category: "social" },
      ],
      practical: {
        difficulty: "beginner",
        energyLevel: "low",
        groupSize: { min: 2 },
        suitableFor: ["warmup", "exercise"],
      },
    },
  },

  // ── Category: short-exercise ──
  {
    id: "mirror-exercises",
    category: "short-exercise",
    input: {
      name: "Mirror Exercises",
      languageCode: "en",
      sourceName: "improwiki",
      tags: ["Improv Exercises"],
      htmlContent: `
<p>Two players face each other. One leads with slow movements, the other mirrors exactly. The goal is for an observer to not be able to tell who leads.</p>
<p>After a while, switch roles. Eventually, try leading and following simultaneously — no designated leader.</p>
<p>This classic exercise trains observation, patience, and physical synchronization.</p>
      `.trim(),
    },
    expectedOutput: {
      summary: "A test case for golden set validation.",
      description: "Mirror Exercises is a classic paired improv warm-up where two players face each other and one mirrors the other's slow movements exactly. The goal is for an observer to be unable to tell who is leading.",
      howToPlay: {
        steps: [
          { action: "Two players face each other. One leads with slow, deliberate movements while the other mirrors exactly." },
          { action: "The goal is for an observer to not be able to tell who leads." },
          { action: "Switch roles after a while." },
          { action: "Eventually try leading and following simultaneously with no designated leader." },
        ],
      },
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: [
        { name: "mirroring", category: "interaction" },
        { name: "shared leadership", category: "structure" },
      ],
      skills: [
        { name: "observation", category: "cognitive" },
        { name: "physical synchronization", category: "physical" },
      ],
      practical: {
        difficulty: "beginner",
        energyLevel: "low",
        groupSize: { min: 2 },
        suitableFor: ["warmup", "exercise"],
      },
    },
  },

  // ── Category: german-content ──
  {
    id: "gefuehlspunkte",
    category: "german-content",
    input: {
      name: "Gefühlspunkte",
      languageCode: "de",
      sourceName: "improwiki",
      tags: ["Gefühlsspiele", "game"],
      htmlContent: `
<p>Es werden zwei gut sichtbare Punkte auf die Bühne geklebt. Jedem der beiden Punkte wird durch Publikumszuruf ein „Gefühl" zugeordnet (am besten gegensätzliche, z.B. Hass-Liebe, Eifersucht-Gleichgültigkeit, Trauer-Freude, ...).</p>
<p>Nun gibt das Publikum noch einen Ort vor, an dem die zu improvisierende Szene entstehen soll. Die Spieler entwickeln nun eine zusammenhängende Geschichte, wobei sich die Charaktere frei auf der Bühne bewegen können, jedoch je nach Standort („Gefühlspunkt") ihre Figur unterschiedlich ausspielen, also in der entsprechenden Emotion einfärben. Die Emotion wird immer stärker, je näher die/der Spieler dem Gefühlspunkt kommt. Auf dem Gefühlspunkt gibt es dann den völligen Gefühlsausbruch!</p>
<p>Etwas ähnlich ist das Spiel "Gefühlsquadrat".</p>
<h3>Tipps und Hinweise</h3>
<ul>
<li>Wichtig ist es, nicht nur die Extreme auf den Gefühlspunkten zu spielen, sondern auch die Abstufungen der Gefühle zwischen diesen.</li>
<li>Zusätzlich zum Ort kann man sich auch noch Gegenstände oder Raum- oder Ortsdetails geben lassen, die an dem betreffenden Gefühlspunkt vorhanden sind.</li>
<li>Die (größeren) Bewegungen zwischen den Gefühlspunkten sollten begründet erfolgen und nicht willkürlich erscheinen.</li>
</ul>
      `.trim(),
    },
    expectedOutput: {
      summary: "A test case for golden set validation.",
      description: "Bei Gefühlspunkte werden zwei gut sichtbare Punkte auf die Bühne geklebt und jedem wird per Publikumszuruf ein gegensätzliches Gefühl zugeordnet (z.B. Hass und Liebe). Die Spieler improvisieren eine Szene und färben ihre Figur je nach Nähe zu einem Gefühlspunkt in der entsprechenden Emotion ein.",
      howToPlay: {
        steps: [
          { action: "Klebt zwei gut sichtbare Punkte auf die Bühne." },
          { action: "Lasst jedem Punkt ein gegensätzliches Gefühl durch Publikumszuruf zuordnen (z.B. Hass und Liebe)." },
          { action: "Lasst das Publikum einen Ort für die Szene vorgeben." },
          { action: "Entwickelt eine zusammenhängende Geschichte und bewegt euch frei auf der Bühne." },
          { action: "Spielt die Figur je nach Nähe zu einem Gefühlspunkt in der entsprechenden Emotion aus. Direkt auf dem Punkt: völliger Gefühlsausbruch!", role: "alle Spieler", constraint: "Emotion steigert sich mit Nähe zum Punkt" },
        ],
      },
      variations: [],
      tips: [
        { text: "Nicht nur die Extreme auf den Gefühlspunkten spielen, sondern auch die Abstufungen und Übergänge zwischen den Punkten.", category: "pedagogical" },
        { text: "Zusätzlich zum Ort kann das Publikum auch Gegenstände oder Raumdetails an den Gefühlspunkten vorgeben.", category: "staging" },
        { text: "Größere Bewegungen zwischen den Gefühlspunkten sollten begründet erfolgen und nicht willkürlich wirken.", category: "failure-mode" },
      ],
      referencedElements: [{ name: "Gefühlsquadrat" }],
      mechanics: [
        { name: "Emotions-Zonen", category: "constraint" },
      ],
      skills: [
        { name: "emotional range", category: "vocal" },
      ],
      practical: {
        difficulty: "intermediate",
        energyLevel: "medium",
        suitableFor: ["exercise", "performance"],
      },
    },
  },

  // ── Category: concept-no-howtoplay ──
  {
    id: "game-concept",
    category: "concept-no-howtoplay",
    input: {
      name: "Game",
      languageCode: "en",
      sourceName: "ircwiki",
      tags: ["Concept", "Concepts"],
      htmlContent: `
<p>Game is an improvisational concept.</p>
<h2>Game in longform and shortform improv</h2>
<p>Longform and shortform improv use the word game to define substantial parts of their style.</p>
<ul>
<li>In shortform, game refers to a set of pre-determined rules that govern the general structure of any scene. There are many short form improv games.</li>
<li>In longform, game is an improv concept used when describing what was interesting or funny about an improvisational scene.</li>
</ul>
<h2>Finding the Game</h2>
<p>In order to find a game in a longform improv scene, you typically need to answer three questions:</p>
<h3>What is the situation?</h3>
<p>Who are the people in the scene, where are they and what are they doing? This can be established very quickly within a few lines.</p>
<h3>What is the first unusual thing?</h3>
<p>The first unusual thing is the first thing that a character does or says that sticks out like a sore thumb, something that feels out of place within the given situation.</p>
<h3>If this is true, then what else is true?</h3>
<p>Once we know what is out of the ordinary, we want to find variations that form a pattern of behavior, by asking "if this is true, what else is true". That way, we can explore and heighten that pattern to play the game.</p>
      `.trim(),
    },
    expectedOutput: {
      summary: "A test case for golden set validation.",
      description: "\"Game\" is a foundational improv concept with distinct meanings in shortform and longform. In shortform, a game is a set of pre-determined rules. In longform, the \"game of the scene\" is the interesting pattern discovered during improvisation.",
      howToPlay: null,
      variations: [],
      tips: [
        { text: "In shortform, a game is a set of pre-determined rules that govern the general structure of any scene.", category: "general" },
        { text: "In longform, find the game by answering: What is the situation? What is the first unusual thing? If this is true, then what else is true?", category: "pedagogical" },
      ],
      referencedElements: [],
      mechanics: [],
      skills: [],
      practical: {},
    },
  },

  // ── Category: ask-for-edge ──
  {
    id: "what-did-you-want",
    category: "ask-for-edge",
    input: {
      name: "What did you want to be when you grew up?",
      languageCode: "en",
      sourceName: "learnimprov",
      tags: ["Ask For"],
      htmlContent: "\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t",
    },
    expectedOutput: {
      summary: "A test case for golden set validation.",
      description: "\"What did you want to be when you grew up?\" is an audience ask-for prompt used to solicit suggestions to inspire an improv scene. It is not a game or exercise in itself.",
      howToPlay: null,
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: [],
      skills: [],
      practical: {},
    },
  },

  // ── Category: multi-element-parent ──
  {
    id: "tag-games-index",
    category: "multi-element-parent",
    input: {
      name: "Tag Games",
      languageCode: "en",
      sourceName: "improwiki",
      tags: ["Warm-ups"],
      htmlContent: `
<p>Tag games are well suited at the beginning of a rehearsal evening, or in between sessions to wake everyone up again. Some tag games also help new groups overcome the fear of physical contact.</p>

<h2>Alphabet Tag</h2>
<p>This game builds on the classic tag game everyone knows. You can protect yourself from the chaser by saying a word starting with the letter "A" before being touched. With every attempted tag you must say a new word starting with "A". Players who can't think of a word, repeat one already said, or get touched before they can speak become the new chaser. With each new chaser the next letter of the alphabet applies.</p>

<h2>Name Calling</h2>
<p>Players can avoid being caught by calling out the name of another player when things get tight. That player immediately becomes the new chaser. It gets funny when you call out a player who is standing right behind the current chaser.</p>

<h2>Chain Tag</h2>
<p>Two players hold hands and form a pair. This pair tries to tag other players together. They must not let go of each other. The tagged player joins as a third link in the chain. When a fourth is caught, the four split into two pairs. The last player not in a chain wins.</p>
      `.trim(),
    },
    expectedOutput: {
      summary: "A test case for golden set validation.",
      description: "Tag Games is a collection of tag-based warm-up games suitable for the start of rehearsal or between sessions. They include Alphabet Tag, Name Calling, and Chain Tag.",
      howToPlay: null,
      variations: [],
      tips: [
        { text: "Tag games help new groups overcome the fear of physical contact.", category: "group-dynamic" },
      ],
      referencedElements: [{ name: "Alphabet Tag" }, { name: "Name Calling" }, { name: "Chain Tag" }],
      mechanics: [],
      skills: [],
      practical: {
        difficulty: "beginner",
        energyLevel: "high",
        suitableFor: ["warmup"],
      },
    },
  },

  // ── Category: multi-element-child ──
  {
    id: "alphabet-tag",
    category: "multi-element-child",
    input: {
      name: "Alphabet Tag",
      languageCode: "en",
      sourceName: "improwiki",
      tags: ["Warm-ups"],
      htmlContent: `
<h2>Alphabet Tag</h2>
<p>This game builds on the classic tag game everyone knows. You can protect yourself from the chaser by saying a word starting with the letter "A" before being touched. With every attempted tag you must say a new word starting with "A". Players who can't think of a word, repeat one already said, or get touched before they can speak become the new chaser. With each new chaser the next letter of the alphabet applies. The game gets harder if only one-syllable words are allowed.</p>
      `.trim(),
    },
    expectedOutput: {
      summary: "A test case for golden set validation.",
      description: "Alphabet Tag is a word-based variant of tag where players protect themselves by saying a word starting with the current letter of the alphabet. Each time a new chaser is tagged in, the letter advances to the next in the alphabet.",
      howToPlay: {
        steps: [
          { action: "One player is the chaser. Others avoid being tagged." },
          { action: "To protect yourself, say a word starting with the current letter before the chaser touches you.", constraint: "Must be a new word each attempt" },
          { action: "If you can't think of a word, repeat one, or get tagged before speaking, you become the new chaser." },
          { action: "With each new chaser, advance to the next letter of the alphabet." },
        ],
      },
      variations: [],
      tips: [
        { text: "The game gets harder if only one-syllable words are allowed.", category: "pedagogical" },
      ],
      referencedElements: [],
      mechanics: [
        { name: "tag", category: "interaction" },
        { name: "alphabet constraint", category: "constraint" },
      ],
      skills: [
        { name: "quick thinking", category: "cognitive" },
      ],
      practical: {
        difficulty: "intermediate",
        energyLevel: "high",
        suitableFor: ["warmup"],
      },
    },
  },

  // ── Category: chain-tag-child ──
  {
    id: "chain-tag",
    category: "chain-tag-child",
    input: {
      name: "Chain Tag",
      languageCode: "en",
      sourceName: "improwiki",
      tags: ["Warm-ups"],
      htmlContent: `
<h2>Chain Tag</h2>
<p>Two players hold hands and form a pair. This pair tries to tag other players together. They must not let go of each other. The tagged player joins as a third link in the chain. Now the three try to catch new players. When a fourth is caught, the four split into two pairs. The last player not in a chain wins.</p>
      `.trim(),
    },
    expectedOutput: {
      summary: "A test case for golden set validation.",
      description: "Chain Tag is a cooperative tag game where players form a growing chain by holding hands. The chain grows until four players are linked, then splits into two pairs. The last solo player wins.",
      howToPlay: {
        steps: [
          { action: "Two players hold hands forming a pair. This pair tries to tag other players.", constraint: "Must not let go of each other" },
          { action: "A tagged player joins as a third link in the chain." },
          { action: "The chain of three tries to catch a fourth player." },
          { action: "When four are caught, the chain splits into two pairs." },
          { action: "The last solo player not in a chain wins." },
        ],
      },
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: [
        { name: "tag", category: "interaction" },
        { name: "chain formation", category: "structure" },
      ],
      skills: [
        { name: "cooperation", category: "social" },
        { name: "spatial awareness", category: "physical" },
      ],
      practical: {
        difficulty: "beginner",
        energyLevel: "high",
        suitableFor: ["warmup"],
      },
    },
  },

  // ── Category: show-format ──
  {
    id: "deconstruction",
    category: "show-format",
    input: {
      name: "Deconstruction",
      languageCode: "en",
      sourceName: "ircwiki",
      tags: ["Improv Form", "Improv Forms"],
      htmlContent: `
<p>The Deconstruction is a long form structure developed by Del Close and The Family.</p>
<h2>Structure</h2>
<p>OPENING SCENE: A long (6-8min) two person scene that is all about providing information that will be used in the rest of the piece. This scene is all about relationship and exploring the problem that is presented (but not solved) in this opening scene.</p>
<p>TWO (2) THEMATIC SCENES (2-3mins): Each THEMATIC SCENE is dedicated to exploring what the opening scene was ABOUT by taking what one of the Opening Scene's characters did and exploring their WANTS/FLAWS.</p>
<p>RETURN TO THE OPENING SCENE (1 1/2-2mins): After seeing how others perceived the characters of the opening scene, the Opening Scene returns to clarify and solidify what the rest of the piece is ABOUT.</p>
<p>FIVE (5) COMMENTARY SCENES (1 1/2-2mins long): These scenes comment on what was unusual or flawed about the characters in the Opening Scene. They are extremely game heavy and should focus on "bits" — straight man vs. absurd man.</p>
<p>RETURN TO THE OPENING SCENE AGAIN (1 - 1 1/2 min): A quick return to the opening scene to heighten the stakes using ideas from the Commentary scenes. This is technically the first scene of "THE RUN".</p>
<p>THE RUN: An intense series of ever-shorter scenes. Pace is as important, if not more important, than content. Anything goes. As long as you consistently pick up the pace until you reach a breakneck pace it will work.</p>
<p>OPENING SCENE RETURNS/FINAL: The Opening Scene returns to wrap up the show for about 1 1/2 - 2mins. A classic technique is to go back in time — showing the characters before their conflict began, creating a poignant contrast.</p>
      `.trim(),
    },
    expectedOutput: {
      summary: "A test case for golden set validation.",
      description: "The Deconstruction is a long-form improv structure developed by Del Close and The Family. It starts with a long two-person opening scene introducing characters and a problem, then \"deconstructs\" that scene through thematic and commentary scenes, building to an accelerating run before a final resolution.",
      howToPlay: {
        steps: [
          { action: "Opening Scene (6-8 min): A long two-person scene establishing relationship and a problem — present but not solve it.", role: "two players" },
          { action: "Two Thematic Scenes (2-3 min each): Scenes exploring what the opening scene was ABOUT, taking one character's wants/flaws into new contexts." },
          { action: "Return to Opening Scene (1.5-2 min): Clarify and solidify the central theme." },
          { action: "Five Commentary Scenes (1.5-2 min each): Game-heavy scenes commenting on what was unusual or flawed about the opening characters." },
          { action: "Second Return to Opening (1-1.5 min): Heighten the stakes using ideas from commentary scenes." },
          { action: "The Run: An accelerating series of ever-shorter scenes pulling tangents from earlier material at breakneck pace." },
          { action: "Opening Scene Returns/Final (1.5-2 min): Wrap up the show, often by going back in time to before the conflict began." },
        ],
      },
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: [
        { name: "opening scene", category: "structure" },
        { name: "thematic exploration", category: "structure" },
        { name: "callback run", category: "structure" },
      ],
      skills: [
        { name: "long-form narrative", category: "narrative" },
        { name: "character work", category: "social" },
        { name: "theme exploration", category: "cognitive" },
      ],
      practical: {
        difficulty: "advanced",
        typicalDurationMinutes: 25,
        energyLevel: "high",
        suitableFor: ["performance"],
      },
    },
  },

  // ── Category: vocabulary ──
  {
    id: "vocabulary-clusters",
    category: "vocabulary",
    input: {
      name: "Vocabulary Test",
      languageCode: "en",
      sourceName: "improwiki",
      tags: [],
      htmlContent: "",
    },
    expectedOutput: {
      summary: "A test case for golden set validation.",
      description: "Vocabulary clustering test data — not a real element.",
      howToPlay: null,
      variations: [],
      tips: [],
      referencedElements: [],
      mechanics: [],
      skills: [],
      practical: {},
    },
  },
];
