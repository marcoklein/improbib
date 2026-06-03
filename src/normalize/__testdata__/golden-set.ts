export interface GoldenInput {
  name: string;
  htmlContent: string;
  languageCode: string;
  sourceName: string;
  tags: string[];
}

export interface GoldenOutput {
  description: string;
  howToPlay: string | null;
  variations: { name: string; description: string }[];
  tips: string[];
  referencedElements: string[];
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
      description:
        "Freeze Tag is a fast-paced improv game where two players start a scene, anyone calls \"Freeze!\" to lock them in position, and a new player taps in, assumes the frozen pose, and launches an entirely new, unrelated scene. It trains spontaneity, physicality, and the core improv principle of accepting what you are given and building on it. Also known as \"Freeze\", \"Zap\", \"Chain Impro\" or \"Tap Out\".",
      howToPlay:
        "1. Two players begin a scene with full physical commitment — moving, using the space, no \"talking heads\".\n2. Any waiting player shouts \"Freeze!\" or \"Stop!\" when the stage picture is strong or interesting.\n3. Both stage players freeze instantly in their exact poses — no drift, no relaxation.\n4. A waiting player steps forward, gently taps out one frozen player, and takes over that exact pose. The tapped-out player leaves the stage.\n5. The new player immediately begins a completely new scene, justifying the pose with fresh characters, setting, and story — totally unrelated to the previous scene.\n6. Repeat until the group decides to end.",
      variations: [
        {
          name: "Blind Freeze",
          description:
            "Waiting players stand with their backs to the stage. They call \"stop\", turn around, and must work with whatever picture they find. Prevents pre-planning and pushes pure spontaneity.",
        },
        {
          name: "Elimination Freeze",
          description:
            "Competitive version. Players who hesitate, lack ideas, or stall in justification are eliminated. The last remaining player is the \"freeze king\". Works especially well in shows.",
        },
        {
          name: "Object Freeze",
          description:
            "Poses must involve interaction with an invisible object. Every new scene defines what object is being held or manipulated by the body posture.",
        },
      ],
      tips: [
        "Avoid the obvious continuation — a raised arm doesn't always have to be a traffic cop. Take the idea one step further.",
        "Give extreme and dynamic poses as gifts when you are on stage. Static standing offers no inspiration to the next player.",
        "Time the freeze when the stage picture is especially strong or a conflict has just peaked — not too early, not too late.",
        "Watch colleagues' poses carefully from the sideline. Inaccurate pose reproduction leads to a wooden new scene start.",
      ],
      referencedElements: [],
    },
  },

  // ── Category: inline-variant ──
  {
    id: "half-life",
    category: "inline-variant",
    input: {
      name: "Half-Life",
      languageCode: "en",
      sourceName: "improwiki",
      tags: [],
      htmlContent: `
<p>Also known as Fast Forward</p>
<p>A scene is played within one minute and is then repeated in the given time frames of 30, 15, 7, 3 seconds and finally 1 second.</p>
<p>This shortening forces the players to reduce themselves more and more to the essentials of the scene. As a rule, even a weak starting scene turns into a guaranteed laugh thanks to the slapstick effect of the compressions.</p>
<h2>Tips and notes</h2>
<ul>
<li>It helps to ask the audience for a suggestion based on a dramatic situation.</li>
<li>The starting scene should contain as much action as possible: changes of location, dialogue, drama and so on.</li>
<li>It is important to always keep the key anchor points of the original scene in the shorter follow-up rounds. The game lives from the repetition of exactly these defining beats. And of course the audience enjoys watching the players struggle, race against the clock and end up completely out of breath.</li>
</ul>
<p>Variant: The starting scene can have any length, and the first compression then cuts it down to one minute.</p>
      `.trim(),
    },
    expectedOutput: {
      description:
        "Half-Life (also known as Fast Forward) is an improv game where a scene is first played in one minute, then repeated in ever-shorter time frames — 30, 15, 7, 3, and finally 1 second. The rapid compression forces players to strip each repetition down to the essential beats, and the resulting slapstick effect reliably generates laughs even from weak starting material.",
      howToPlay:
        "1. Ask the audience for a dramatic situation to start the scene.\n2. Play a scene with as much action as possible — location changes, dialogue, drama.\n3. After one minute, repeat the same scene in 30 seconds, hitting all the key anchor points.\n4. Repeat again in 15 seconds, then 7, then 3, then 1 second, each time compressing to the essentials.",
      variations: [
        {
          name: "Variable Start Length",
          description:
            "The starting scene can have any length, and the first compression then cuts it down to one minute.",
        },
      ],
      tips: [
        "Ask the audience for a suggestion based on a dramatic situation — it gives the scene stakes from the start.",
        "The starting scene should contain as much action as possible: changes of location, dialogue, drama — the more material, the funnier the compressions.",
        "Always keep the key anchor points of the original scene in the shorter follow-up rounds. The game lives from the repetition of exactly these defining beats.",
      ],
      referencedElements: [],
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
      description:
        "Yes - No is a simple paired improv exercise where one player can only say \"Yes\" and the other only \"No\". Despite having just one word each, they carry out a full conversation using tone, volume, rhythm, pauses, and body language. Roles are swapped partway through.",
      howToPlay:
        "1. Form pairs. One player may only say \"Yes\", the other only \"No\".\n2. Have a full conversation despite the limitation, using tone, volume, rhythm, pauses, and body language to convey meaning.\n3. After a while, switch roles so each player experiences both constraints.",
      variations: [],
      tips: [
        "Communication is mostly non-verbal — this exercise makes that vivid by restricting vocabulary to a single word each.",
        "Use tone, volume, rhythm, and pauses to differentiate between question, statement, anger, excitement, and other meanings.",
      ],
      referencedElements: [],
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
      description:
        "Mirror Exercises is a classic paired improv warm-up where two players face each other and one mirrors the other's slow movements exactly. The goal is for an outside observer to be unable to tell who is leading and who is following. It trains observation, patience, and physical synchronization.",
      howToPlay:
        "1. Two players face each other. One leads with slow, deliberate movements while the other mirrors exactly.\n2. The goal is for an observer to not be able to tell who leads.\n3. Switch roles after a while.\n4. Eventually, try leading and following simultaneously with no designated leader.",
      variations: [],
      tips: [],
      referencedElements: [],
    },
  },

  // ── Category: medium-game ──
  {
    id: "talk-at-touch",
    category: "medium-game",
    input: {
      name: "Talk at touch",
      languageCode: "en",
      sourceName: "improwiki",
      tags: ["Physical Contact", "game"],
      htmlContent: `
<p>A scene is played by two players, if necessary with input from the audience.</p>
<p>However, it is only allowed to speak if one player touches the other and then only the person who makes the touch is allowed to speak. Permanent contact such as holding hands is prohibited.</p>
<p>This leads to a change from mute to spoken sections. The comedy arises from the necessity of the players to touch each other somewhere in order to be able to tell him something.</p>
<p>Variant: A touch is always valid in both directions, i.e. as soon as the contact is there, both may speak, no matter who gave the touch. As soon as the contact breaks off, both have to be silent again and can only play pantomime.</p>
      `.trim(),
    },
    expectedOutput: {
      description:
        "Talk at touch is a two-player improv game where speaking is only allowed while one player is physically touching the other, and only the player who initiated the touch may talk. Permanent contact like holding hands is prohibited. The constant alternation between mute physical play and spoken sections creates comedy from the necessity to touch in order to communicate.",
      howToPlay:
        "1. Two players perform a scene, optionally with an audience suggestion.\n2. A player may only speak while touching the other player, and only the touching player may talk.\n3. Permanent contact such as holding hands is prohibited — touch must be initiated anew each time.\n4. This produces a rhythm of mute physical sections alternating with spoken dialogue.",
      variations: [
        {
          name: "Bidirectional Touch",
          description:
            "A touch is valid in both directions: as soon as contact exists, both players may speak regardless of who initiated it. When contact breaks, both must be silent and can only play pantomime.",
        },
      ],
      tips: [],
      referencedElements: [],
    },
  },

  // ── Category: external-refs ──
  {
    id: "swinging-pendulum",
    category: "external-refs",
    input: {
      name: "Swinging Pendulum of Death",
      languageCode: "en",
      sourceName: "improwiki",
      tags: ["Improv Games"],
      htmlContent: `
<h3>Actors</h3>
<p>3</p>
<h3>Suggestions</h3>
<p>3 locations, 3 conflicts, 3 characters</p>
<h3>Premise</h3>
<p>This game is complicated but can be extremely entertaining if done well. It is therefore presented in step-by-step instructions.</p>
<ol>
<li>Each actor is given a location, conflict, and character</li>
<li>For our example we'll use a car salesman trying to sell cars to blind people in a mall, a half-man/half-duck trying to get a job at a supermarket, and an ex-ballerina with an addiction to smelling grass at a grass-smellers anonymous meeting. Got all that?</li>
<li>The game will start at the mall. The only given character is the car salesman, so of course the other two will be blind. They must build up the scene to the point that the salesman dies.</li>
<li>The judge will then call out one of the other two locations, say the supermarket. The salesman will "come back to life" as a new character within the new location, perhaps the manger interviewing the duck/man. The third actor might act as a current employee with an unnatural fear of ducks. Again, the scene must be advanced to the point that the duck/man dies.</li>
<li>Rinse and repeat for the third location. Duck/man comes to life as a different character in this location, and the scene is advanced until the ex-ballerina dies.</li>
<li>After the three deaths are established, the judge will call any one of the locations at random, and the actor who died in that location must immediately drop dead, and the other actors must pick up where the scene left off, dealing with the aftermath of the death. This will be repeated until the buzzer signals the end of the game.</li>
</ol>
      `.trim(),
    },
    expectedOutput: {
      description:
        "Swinging Pendulum of Death is a complex three-player improv game with strong narrative structure. Each player is given a distinct character, location, and conflict. The game cycles through three locations, with one character dying at each, then repeatedly revisits locations at random — requiring the actor who died there to drop dead instantly while the others deal with the aftermath.",
      howToPlay:
        "1. Assign each of three actors a location, a conflict, and a character.\n2. Start at the first actor's location. The other two adapt to fit that scenario. Play the scene until that actor's character dies.\n3. The judge calls a new location. The actor who just died returns as a new character. Play the scene until the second actor's character dies.\n4. Repeat for the third location until the third character dies.\n5. Once all three deaths are established, the judge calls locations at random. The actor who died in that location immediately drops dead, and the others continue the aftermath. Repeat until the game ends.",
      variations: [],
      tips: [],
      referencedElements: [],
    },
  },

  // ── Category: long-form-show ──
  {
    id: "superscene",
    category: "long-form-show",
    input: {
      name: "Superscene",
      languageCode: "en",
      sourceName: "improwiki",
      tags: ["Improv Forms", "Improv Games", "Long Forms", "show", "longform"],
      htmlContent: `
<p>Three to five people can take part in this game. Each of the players is responsible for one of the stories, as its director. He introduces the scene, asks the audience about the guidelines, and can -- if he wants -- place any further requirements, e.g., deciding on the form of his game (e.g., rhyme, ABC-game, genre). The other players now perform the scene. At a given time, the director ends the scene. Then it is the next player's turn, taking on the role of director. He also introduces the scene and creates the guidelines, etc, then it also gets played. It continues this way until all three to five players have directed one time.</p>
<p>After that the round of the game is over. The scenes which were performed are each briefly outlined and promoted by the directors, who make it clear why the audience should definitely see its sequel. The audience now decides which story they would like to see more of. Each scene performed is voted upon by applause. The scene with the least applause falls out.</p>
<p>The second round begins. Each of the individuals who directed one of the stories to be continued receive additional guidelines from the audience, and in addition the players can make further suggestions. The rest of this round goes like the first, but just without the play which was eliminated. Also after this round, one play is rejected. At the end, one story remains, the "Superscene", the story which the audience collectively found most interesting.</p>
<p>Hints and Tips:</p>
<p>The directors only promote their own story, they will not comment on or disparage the others. It is all about arousing and maintaining the interest of the audience in the progress of the story. It is sensible to end each scene with a cliff-hanger. The director does not cut off the continuing scene by the rules any more. It is about creative cooperation, i.e. even when the directors (supposedly) are competitors, all still try to give their best in every scene.</p>
      `.trim(),
    },
    expectedOutput: {
      description:
        "Superscene is a long-form improv show format for three to five players, structured as a competitive storytelling tournament. Each player acts as a director for their own story, casting the others as actors. After all directors have presented one scene, the audience votes by applause to eliminate one story each round until a single \"Superscene\" remains.",
      howToPlay:
        "1. Three to five players participate. Each takes a turn as \"director\" of their own story.\n2. The director introduces the scene, asks the audience for guidelines, and may impose additional requirements (rhyme, genre, ABC-game, etc.).\n3. The other players perform the scene. The director ends it at a chosen moment.\n4. After all directors have presented, each briefly promotes their story to the audience.\n5. The audience votes by applause on each scene. The scene with the least applause is eliminated.\n6. The remaining directors receive additional audience guidelines for the next round. Play another round without the eliminated story.\n7. Repeat until one story remains — the \"Superscene\".",
      variations: [],
      tips: [
        "Directors should only promote their own story — never comment on or disparage others.",
        "End each scene with a cliff-hanger to make the audience curious and invested in seeing the sequel.",
        "The goal is to arouse and maintain the audience's interest in the progress of the story across rounds.",
        "Despite the competitive format, this is about creative cooperation — all players should give their best in every scene, regardless of whose story it is.",
      ],
      referencedElements: [],
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
      description:
        "Bei Gefühlspunkte werden zwei gut sichtbare Punkte auf die Bühne geklebt und jedem wird per Publikumszuruf ein gegensätzliches Gefühl zugeordnet (z.B. Hass und Liebe). Die Spieler improvisieren eine zusammenhängende Szene an einem vom Publikum vorgegebenen Ort, wobei sie ihre Figur je nach Nähe zu einem Gefühlspunkt in der entsprechenden Emotion einfärben — direkt auf dem Punkt erfolgt der völlige Gefühlsausbruch.",
      howToPlay:
        "1. Zwei gut sichtbare Punkte werden auf der Bühne markiert.\n2. Das Publikum ordnet jedem Punkt ein gegensätzliches Gefühl zu (z.B. Hass und Liebe, Eifersucht und Gleichgültigkeit).\n3. Das Publikum gibt einen Ort für die Szene vor.\n4. Die Spieler entwickeln eine zusammenhängende Geschichte und bewegen sich frei auf der Bühne.\n5. Je näher ein Spieler einem Gefühlspunkt kommt, desto stärker spielt er die entsprechende Emotion aus. Auf dem Punkt selbst erfolgt der völlige Gefühlsausbruch.",
      variations: [],
      tips: [
        "Nicht nur die Extreme auf den Gefühlspunkten spielen, sondern auch die Abstufungen und Übergänge der Gefühle zwischen den Punkten.",
        "Zusätzlich zum Ort kann das Publikum auch Gegenstände oder Raumdetails an den Gefühlspunkten vorgeben (z.B. ein Sessel am Hass-Punkt, ein Fernseher am Liebes-Punkt).",
        "Größere Bewegungen zwischen den Gefühlspunkten sollten begründet erfolgen und nicht willkürlich wirken.",
      ],
      referencedElements: ["Gefühlsquadrat"],
    },
  },

  // ── Category: german-exercise ──
  {
    id: "distanz-schlaegerei",
    category: "german-exercise",
    input: {
      name: "Distanz-Schlägerei",
      languageCode: "de",
      sourceName: "improwiki",
      tags: ["Pantomime Übungen", "Aktion und Reaktion - Übungen", "exercise"],
      htmlContent: `
<p>Zwei Spieler stehen sich in angemessener Entfernung gegenüber. Einer ist der Angreifer, der andere der Verteidiger. Der Angreifer nutzt wechselnd Füße, Arme, Kopf, Schulter, um plötzlich und immer wieder den Verteidiger zu attackieren. Dies jedoch immer in sicherer Entfernung. Der Angegriffene reagiert spontan so, als wenn er wirklich getroffen worden wäre.</p>
<p>Das Spiel kann entweder paarweise gespielt werden, oder die ganze Gruppe kämpft zugleich, "jeder gegen jeden".</p>
<p>Die Übung ist zum Aufwärmen geeignet, gut zum Hemmungen- und Frust-Abbauen, und trainiert außerdem den Ausdruck.</p>
<p>Siehe auch Zeitlupenschlägerei</p>
      `.trim(),
    },
    expectedOutput: {
      description:
        "Distanz-Schlägerei ist eine pantomimische Aufwärmübung, bei der zwei Spieler in sicherer Entfernung einen Kampf simulieren. Der Angreifer attackiert mit wechselnden Körperteilen aus der Distanz, der Verteidiger reagiert spontan, als wäre er wirklich getroffen worden. Die Übung kann paarweise oder in der ganzen Gruppe gespielt werden.",
      howToPlay:
        "1. Zwei Spieler stellen sich in angemessener Entfernung gegenüber auf.\n2. Einer ist der Angreifer, der andere der Verteidiger. Der Angreifer nutzt wechselnd Füße, Arme, Kopf und Schultern, um plötzlich und immer wieder zu attackieren — stets aus sicherer Entfernung.\n3. Der Verteidiger reagiert spontan, als wäre er wirklich getroffen worden.\n4. Variante: Die ganze Gruppe kämpft gleichzeitig, \"jeder gegen jeden\".",
      variations: [],
      tips: [
        "Die Übung eignet sich gut zum Aufwärmen, zum Hemmungen- und Frust-Abbauen und trainiert den körperlichen Ausdruck.",
        "Trotz der Distanz muss der Verteidiger überzeugend und spontan auf jeden Angriff reagieren.",
      ],
      referencedElements: ["Zeitlupenschlägerei"],
    },
  },

  // ── Category: learnimprov-structured ──
  {
    id: "harold-french",
    category: "learnimprov-structured",
    input: {
      name: "Harold-French",
      languageCode: "en",
      sourceName: "learnimprov",
      tags: ["Long Form"],
      htmlContent: `
<p>Synonyms: Herald, Sheila</p>
<p>French Harold – A Harold that takes place in one environment.</p>
<p>Introduction: We are about to perform a series of scenes loosely associated to one theme. May I get a general theme please.</p>
<p>Description: The Harold is a series of scenes that are connected by a common general theme. The audience does not participate further with suggestions, and all 11 to 12 scenes are based on the chosen theme. The format was created by Del Close.</p>
<p>The Most Common Format: 3 sets of 3 scenes. Any number of improvisers start riffing off the theme as a group (free associations, group song, etc.). 3 scenes follow, not related to each other but informed by the theme. Another handle is played. This cycle repeats 3 times for 9 open scenes total. By the last round, stories start to weave together.</p>
<p>Scene Transitions: In a Harold, open scenes are not called by a booth — transitions are determined by offstage ensemble members (wipes). Types: clap, front wipe, tap out, ass wipe, technical, director cut.</p>
<p>Variations: Monoscene – A Harold in one environment. Blind Harold – blindfolded in the dark. The Bat – unblindfolded Harold in the dark. Armando – scenes interceded by true story monologues. Sybil – performed by a single performer. The Narce – single performer Harold. Triple Play – 3 by 3 scenes with no interceding handles.</p>
<p>Credits: Del Close</p>
      `.trim(),
    },
    expectedOutput: {
      description:
        "Harold-French (also called Herald or Sheila) is a version of the Harold long-form improv format where all scenes take place in a single environment. The Harold itself is a classic structure of three sets of three scenes connected by a common theme, created by Del Close. Scene transitions are controlled by offstage ensemble members through various \"wipe\" techniques.",
      howToPlay:
        "1. Get a broad general theme from the audience (single word or phrase).\n2. The ensemble opens with a group riff on the theme — free associations, a group song, or similar.\n3. Play 3 open scenes informed by but not directly related to each other.\n4. Perform a predetermined group handle (another structured bit).\n5. Repeat this cycle 3 times total, for 9 open scenes. By the last round, stories should begin to weave together.\n6. Scene transitions are controlled by offstage members through wipes: clap, front wipe, tap out, lights dim, or coach call.",
      variations: [
        {
          name: "Monoscene",
          description: "A Harold that takes place in one environment.",
        },
        {
          name: "Blind Harold",
          description: "Participants are seated and blindfolded in the dark.",
        },
        {
          name: "The Bat",
          description: "Unblindfolded Harold performed in the dark.",
        },
        {
          name: "Armando",
          description: "Scenes are interceded by true story monologues from a designated monologist.",
        },
        {
          name: "Triple Play",
          description: "3 by 3 scenes with no interceding handles.",
        },
      ],
      tips: [
        "The theme should be as broad as possible. Nouns are discouraged. For example, \"toothbrush\" could be wrangled into the theme \"cleaning\".",
        "A smart group will put their best storyteller as their balladeer, not the best singer.",
      ],
      referencedElements: [],
    },
  },

  // ── Category: musical-form ──
  {
    id: "balladeer-doo-wop",
    category: "musical-form",
    input: {
      name: "Balladeer-Doo Wop",
      languageCode: "en",
      sourceName: "learnimprov",
      tags: ["Long Form"],
      htmlContent: `
<p>Synonyms: Minstrel, Musical MC, Doo Wop</p>
<p>Introduction: The following improvisation will be longer than usual. It will be directed by a balladeer, yet remains entirely improvised.</p>
<p>Description: The accompanist and the singer start off with a simple song that may introduce a character, a location, or foreshadow some event. The musical bits are meant to be short — thirty seconds to a minute. Simultaneously, players act on-stage silently while the balladeer sings, and start to vocalize as the ballad ends. The ballad is used to change scenes, rescue a struggling scene, or bring closure to a scene that has reached a conclusion. No blackouts — all changes are made by the balladeer. If the balladeer gets into trouble, the players need to step in with a scene. A smart group puts their best storyteller as balladeer, not the best singer.</p>
<p>A new musical genre can be used for each new ballad: rap, rock, opera.</p>
<p>Variations: Doo Wop — the balladeer is replaced by a group song in the style of Doo Wop. The group song could be any manner of group make-a-song (Hoe Down, March Song, Madrigal, Chant).</p>
      `.trim(),
    },
    expectedOutput: {
      description:
        "Balladeer-Doo Wop (also known as Minstrel or Musical MC) is a long-form musical improv structure directed by a singing balladeer. The accompanist and singer introduce characters, locations, or events through short songs while actors perform silently on stage. The ballads control scene changes, rescues, and closures — there are no blackouts.",
      howToPlay:
        "1. An accompanist and singer (the balladeer) start with a short song (30–60 seconds) introducing a character, location, or foreshadowing an event.\n2. While the balladeer sings, players act on stage silently. When the ballad ends, they begin speaking.\n3. The balladeer uses subsequent ballads to change scenes, rescue struggling scenes, or bring scenes to a conclusion.\n4. No blackouts — all scene transitions are controlled by the balladeer.\n5. Each ballad can use a different musical genre: rap, rock, opera, etc.",
      variations: [
        {
          name: "Doo Wop",
          description: "The balladeer is replaced by a group song in the style of Doo Wop. The group song can be any form of group make-a-song — Hoe Down, March Song, Madrigal, or Chant.",
        },
      ],
      tips: [
        "Put your best storyteller as the balladeer, not necessarily the best singer.",
        "If the balladeer gets into trouble, the players must step in with a scene to recover.",
        "Musical bits should be short — thirty seconds to a minute is usually enough to pass on story information.",
      ],
      referencedElements: [],
    },
  },

  // ── Category: handle-overlay ──
  {
    id: "translation-healthcare",
    category: "handle-overlay",
    input: {
      name: "Translation-Healthcare",
      languageCode: "en",
      sourceName: "learnimprov",
      tags: ["Handle"],
      htmlContent: `
<p>Introduction: In this scene there will be a translator facilitating a healthcare interaction. The patient speaks a non-existent gibberish language.</p>
<p>Description: Healthcare translation is a handle overlaid on an open scene with a predetermined concept. Typically the patient speaks gibberish, though the healthcare worker could as well. This differs from typical translation scenes in that the translation is done for another performer while the audience observes.</p>
<p>It is recommended that the host set up a non-existent language — robot, economist, whale, or toaster. Using gibberish for existing languages can lead to stereotyping for humour, which is punching down.</p>
<p>The performers must create complete characters with movement and wants in addition to the gibberish, and maintain a narrative arc that explores the healthcare interaction.</p>
<p>Gimmicks: Short translation for long gibberish (or vice versa), problems with idioms, differences in emotional content, dirty words.</p>
<p>Variations: Translated Opera (singing gibberish), Translated Film (movie thematics), Bad Translator (real language translated by non-speaker), Mechanical Translator (using Google translate), Future In Laws (meet the parents/in-laws).</p>
      `.trim(),
    },
    expectedOutput: {
      description:
        "Translation-Healthcare is a handle overlaid on an open scene where a translator facilitates a healthcare interaction between a provider and a patient who speaks a made-up gibberish language. Unlike typical translation scenes, the translation is performed for another character on stage — not the audience — so the audience observes both sides. The format emphasizes character work, narrative arc, and avoiding cultural stereotypes.",
      howToPlay:
        "1. A host sets up a non-existent gibberish language (robot, economist, whale, toaster, etc.) and the healthcare scenario.\n2. One performer plays the patient speaking gibberish. Another plays the healthcare provider. A third translates between them.\n3. The patient communicates in gibberish with full physicality, emotion, and want; the translator interprets for the provider, and vice versa.\n4. Performers maintain a narrative arc exploring the healthcare interaction — not just the translation gimmick.",
      variations: [
        {
          name: "Translated Opera",
          description: "As described, with the gibberish sung.",
        },
        {
          name: "Translated Film",
          description: "As described, using movie thematics.",
        },
        {
          name: "Bad Translator",
          description: "Real language translated by a non-speaker of that language.",
        },
        {
          name: "Mechanical Translator",
          description: "Real language translated using Google Translate or similar.",
        },
        {
          name: "Future In Laws",
          description: "Meet the parents/in-laws through a translator.",
        },
      ],
      tips: [
        "Set up a non-existent language (robot, economist, whale) rather than using gibberish for real languages, which can lead to stereotyping.",
        "Create complete characters with movement and wants — don't let the translation gimmick replace the narrative arc.",
        "Short translation for long gibberish (or vice versa) is a classic comedy gimmick.",
      ],
      referencedElements: ["Gibberish"],
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
      description:
        "\"What did you want to be when you grew up?\" is an audience ask-for prompt from learnimprov.com. It is a question used to solicit suggestions from the audience to inspire an improv scene, not a game or exercise in itself.",
      howToPlay: null,
      variations: [],
      tips: [],
      referencedElements: [],
    },
  },

  // ── Category: long-form-theory ──
  {
    id: "deconstruction",
    category: "long-form-theory",
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
      description:
        "The Deconstruction is a long-form improv structure developed by Del Close and The Family. It starts with a long two-person opening scene that introduces characters and a central problem, then \"deconstructs\" that scene through thematic scenes, commentary scenes, and an accelerating run of ever-shorter callbacks, before returning to the opening scene for a final resolution.",
      howToPlay:
        "1. Opening Scene (6–8 min): A long two-person scene establishing relationship and a problem — present but not solve it.\n2. Two Thematic Scenes (2–3 min each): Scenes exploring what the opening scene was ABOUT, taking one character's wants/flaws into new contexts.\n3. Return to Opening Scene (1.5–2 min): Clarify and solidify the central theme.\n4. Five Commentary Scenes (1.5–2 min each): Game-heavy scenes that comment on what was unusual or flawed about the opening characters.\n5. Second Return to Opening (1–1.5 min): Heighten the stakes using ideas from the commentary scenes.\n6. The Run: An intense, accelerating series of ever-shorter scenes pulling tangents from earlier material at breakneck pace.\n7. Opening Scene Returns/Final (1.5–2 min): Wrap up the show, often by going back in time to before the conflict began.",
      variations: [],
      tips: [],
      referencedElements: [],
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
      description:
        "\"Game\" is a foundational improv concept with distinct meanings in shortform and longform. In shortform, a game is a set of pre-determined rules governing a scene's structure. In longform, the \"game of the scene\" is the interesting or funny pattern discovered during improvisation. Finding the game involves identifying the situation, spotting the first unusual thing, and asking \"if this is true, then what else is true?\" to heighten the pattern.",
      howToPlay: null,
      variations: [],
      tips: [
        "In shortform, a game is a set of pre-determined rules that govern the general structure of any scene.",
        "In longform, find the game by answering three questions: What is the situation? What is the first unusual thing? If this is true, then what else is true?",
        "The situation (who, where, what) can be established very quickly — within a few lines, or even through environment and object work before anyone speaks.",
      ],
      referencedElements: [],
    },
  },
];
