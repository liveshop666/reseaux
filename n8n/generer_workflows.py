import json, uuid, sys
OUT = sys.argv[1]

HEADER = {"httpHeaderAuth": {"id": "a-choisir", "name": "CRM x-api-key"}}
GEMINI = {"googlePalmApi": {"id": "qUnzGSFCJf4qEJcK", "name": "Google Gemini(PaLM) Api account"}}

def node(name, type_, ver, params, pos, **extra):
    n = {"parameters": params, "type": type_, "typeVersion": ver, "position": pos, "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, name + type_)), "name": name}
    n.update(extra)
    return n

def note(name, content, pos, w=420, h=220, color=4):
    return node(name, "n8n-nodes-base.stickyNote", 1, {"content": content, "width": w, "height": h, "color": color}, pos)

def connect(conns, src, dst, out=0, inp=0):
    c = conns.setdefault(src, {"main": []})["main"]
    while len(c) <= out: c.append([])
    c[out].append({"node": dst, "type": "main", "index": inp})

# =====================================================================
# Studio 1 — Adapter le texte (Gemini)
# =====================================================================
PROMPT_CODE = r"""// Prépare la demande à Gemini : un texte de départ → une version par réseau coché.
const b = $json.body ?? $json;
const texte = String(b.texte ?? '').slice(0, 6000);
const reseaux = Array.isArray(b.reseaux) ? b.reseaux : [];
const media = b.media ?? 'aucun';

const REGLES = {
  youtube: "YouTube : un TITRE accrocheur et clair (max 100 caractères, mots-clés au début, pas de majuscules partout) + une DESCRIPTION : 2 premières lignes qui donnent envie, puis le détail, un appel à l'action vers https://www.solvelab.fr, et 3 à 5 hashtags à la fin (#Shorts si vidéo courte verticale).",
  linkedin: "LinkedIn : ton professionnel mais humain, à la première personne. 1re ligne = accroche forte (elle s'affiche avant « voir plus »). Paragraphes courts, aérés, 0 à 3 emojis maximum. Finir par une question ou un appel à l'action, puis 3 à 5 hashtags pertinents.",
  tiktok: "TikTok : légende courte et punchy (idéalement moins de 150 caractères), ton direct et dynamique, 1 ou 2 emojis, puis 3 à 5 hashtags (dont des hashtags larges et un de niche).",
  instagram: "Instagram : 1re ligne accrocheuse (avant « plus »), texte chaleureux avec quelques emojis, sauts de ligne, appel à l'action (« lien dans la bio », commenter, enregistrer), puis 8 à 12 hashtags à la fin.",
  facebook: "Facebook (Page) : 1re ligne accrocheuse (avant « Voir plus »), ton chaleureux et conversationnel, quelques emojis, appel à l'action (commenter, partager, s'abonner à la Page), 1 à 3 hashtags maximum.",
  google: "Fiche Google (Google Business Profile) : texte informatif et local, 2 à 4 phrases, AUCUN hashtag, AUCUN numéro de téléphone (Google refuse les posts qui en contiennent), terminer par un appel à l'action simple (« Découvrez… sur notre site »).",
};

const liste = reseaux.map(r => `- "${r.id}" (${r.nom}, ${r.max} caractères max${r.titre_max ? `, titre ${r.titre_max} max` : ''}) : ${REGLES[r.id] ?? ''}`).join('\n');

const prompt = `Tu es le community manager de SolveLab, agence digitale française (sites internet, automatisation et IA, logiciels sur mesure, publicité et marketing digital).
Adapte le texte ci-dessous pour chaque réseau listé. Garde le sens, les faits et les chiffres : n'invente RIEN (pas de prix, de client, de date ou de résultat absents du texte). Français correct, tutoiement interdit sauf si le texte d'origine tutoie.
Média joint : ${media}.

Réseaux :
${liste}

Texte de départ :
---
${texte}
---

Réponds UNIQUEMENT avec un objet JSON de la forme :
{"reseaux": {"<id>": {"texte": "..."}, "youtube": {"titre": "...", "texte": "..."}}}
avec exactement les ids demandés.`;

return [{ json: {
  reseaux_demandes: reseaux.map(r => r.id),
  gemini_body: {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
  },
} }];"""

READ_CODE = r"""// Lit la réponse de Gemini et renvoie { reseaux: { youtube: { titre, texte }, linkedin: { texte }, … } }.
// Si l'IA échoue, on renvoie un objet vide : le Studio reprend alors le texte d'origine.
let reseaux = {};
try {
  const parts = $json.candidates?.[0]?.content?.parts ?? [];
  const raw = parts.map(p => p.text ?? '').join('').trim();
  const data = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  reseaux = data.reseaux ?? data;
} catch (e) { reseaux = {}; }
const demandes = $('Préparer la demande').first().json.reseaux_demandes;
const out = {};
for (const id of demandes) if (reseaux[id]) out[id] = reseaux[id];
return [{ json: { reseaux: out, ia: Object.keys(out).length > 0 } }];"""

n1, c1 = [], {}
n1.append(note("Note", "## Studio Réseaux — 1. Adapter le texte\nAppelé par le Studio (bouton « Adapter avec l'IA »). Gemini (gratuit, ton identifiant existant) écrit une version par réseau et répond **tout de suite** au Studio.\n\nAdresse *Production URL* du webhook → Vercel `N8N_ADAPT_WEBHOOK_URL`.\nRien n'est publié ici.", [-560, -300], 520, 220, 4))
n1.append(node("Ordre du Studio (webhook)", "n8n-nodes-base.webhook", 2.2,
    {"httpMethod": "POST", "path": "studio-adapter", "authentication": "headerAuth", "responseMode": "responseNode", "options": {}},
    [-560, 0], webhookId=str(uuid.uuid5(uuid.NAMESPACE_DNS, "studio-adapter")), credentials=HEADER))
n1.append(node("Préparer la demande", "n8n-nodes-base.code", 2, {"jsCode": PROMPT_CODE}, [-320, 0]))
n1.append(node("IA (Gemini, gratuit) : adapter", "n8n-nodes-base.httpRequest", 4.2, {
    "method": "POST", "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
    "authentication": "predefinedCredentialType", "nodeCredentialType": "googlePalmApi",
    "sendBody": True, "specifyBody": "json", "jsonBody": "={{ JSON.stringify($json.gemini_body) }}", "options": {"timeout": 45000}},
    [-80, 0], credentials=GEMINI, retryOnFail=True, maxTries=3, waitBetweenTries=3000, onError="continueRegularOutput"))
n1.append(node("Lire la réponse", "n8n-nodes-base.code", 2, {"jsCode": READ_CODE}, [160, 0]))
n1.append(node("Répondre au Studio", "n8n-nodes-base.respondToWebhook", 1.5,
    {"respondWith": "json", "responseBody": "={{ JSON.stringify($json) }}", "options": {}}, [400, 0]))
for a, b in [("Ordre du Studio (webhook)", "Préparer la demande"), ("Préparer la demande", "IA (Gemini, gratuit) : adapter"),
             ("IA (Gemini, gratuit) : adapter", "Lire la réponse"), ("Lire la réponse", "Répondre au Studio")]:
    connect(c1, a, b)

wf1 = {"name": "Studio Réseaux — 1. Adapter le texte (Gemini)", "nodes": n1, "connections": c1,
       "settings": {"executionOrder": "v1", "timezone": "Europe/Paris"}, "pinData": {}}

# =====================================================================
# Studio 2 — Publier
# =====================================================================
P = "$('Mes paramètres').first().json"
I = "$('Une publication').item.json"
STUDIO = f"{P}.url_studio.replace(/\\/$/, '')"

n2, c2 = [], {}
n2.append(note("Note", "## Studio Réseaux — Publier\nNe publie **que** ce que j'ai validé dans le Studio (clic « Publier » ou date programmée arrivée).\n- Le Studio appelle le webhook (Vercel `N8N_PUBLISH_WEBHOOK_URL`) au clic : tout de suite, ou avec `quand` = date programmée → n8n **attend** cette heure (1 seule exécution par post).\n- Filet de sécurité toutes les 2 h (7h-23h) : rattrape un oubli. Peu d'exécutions = quota n8n préservé.\n\n`GET /api/n8n/due` → chaque réseau → `PATCH /api/n8n/targets/:id` (statut + lien).", [-900, -420], 560, 240, 4))
n2.append(note("Note comptes", "### 🔑 Identifiants à choisir\n- **CRM x-api-key** (Header Auth, `x-api-key` = STUDIO_API_KEY)\n- **YouTube OAuth2 API**\n- **LinkedIn OAuth2 API** (cocher *Organization Support* pour la page)\n- **Facebook Graph API** (jeton de Page longue durée → Instagram et Page Facebook)\n- **Google Business Profile OAuth2 API**\n- TikTok : rien ici, le jeton est géré par le Studio.", [-320, -420], 460, 240, 6))

n2.append(node("Réveil par le Studio (webhook)", "n8n-nodes-base.webhook", 2.2,
    {"httpMethod": "POST", "path": "studio-publier", "authentication": "headerAuth", "responseMode": "onReceived", "options": {}},
    [-900, -60], webhookId=str(uuid.uuid5(uuid.NAMESPACE_DNS, "studio-publier")), credentials=HEADER))
n2.append(node("Attendre l'heure prévue", "n8n-nodes-base.wait", 1.1,
    {"resume": "specificTime", "dateTime": "={{ $json.body?.quand && new Date($json.body.quand) > new Date() ? $json.body.quand : $now.plus({ seconds: 2 }).toISO() }}"},
    [-680, -60], webhookId=str(uuid.uuid5(uuid.NAMESPACE_DNS, "studio-wait-until"))))
n2.append(node("Filet de sécurité (toutes les 2 h)", "n8n-nodes-base.scheduleTrigger", 1.2,
    {"rule": {"interval": [{"field": "cronExpression", "expression": "7 7-23/2 * * *"}]}}, [-900, 120]))

def a(id_, name, value, t="string"):
    return {"id": id_, "name": name, "value": value, "type": t}
n2.append(node("Mes paramètres", "n8n-nodes-base.set", 3.4, {"mode": "manual", "includeOtherFields": False, "assignments": {"assignments": [
    a("p1", "url_studio", "A_REMPLIR https://ton-studio.vercel.app"),
    a("p2", "linkedin_personne", "identifiant LinkedIn de ton profil (ex. AbC123xyz) — seulement si LinkedIn"),
    a("p3", "linkedin_page", "identifiant numérique de la page SolveLab (ex. 12345678) — seulement si page"),
    a("p4", "instagram_compte_id", "identifiant du compte Instagram pro (ex. 1784…) — seulement si Instagram"),
    a("p10", "facebook_page_id", "identifiant de la Page Facebook (ex. 1234567890) — seulement si Facebook"),
    a("p5", "compte_google", "accounts/123 — seulement si fiche Google"),
    a("p6", "etablissement_google", "locations/456 — seulement si fiche Google"),
    a("p7", "site_web", "https://www.solvelab.fr"),
    a("p8", "tiktok_confidentialite", "SELF_ONLY"),
    a("p9", "youtube_visibilite", "public"),
]}, "options": {}}, [-460, 30]))
n2.append(node("Paramètres remplis ?", "n8n-nodes-base.filter", 2.2, {"conditions": {
    "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
    "conditions": [{"leftValue": "={{ $json.url_studio }}", "operator": {"type": "string", "operation": "notContains"}, "rightValue": "A_REMPLIR"}],
    "combinator": "and"}, "options": {}}, [-260, 30]))
n2.append(node("Studio : à publier maintenant", "n8n-nodes-base.httpRequest", 4.2, {
    "url": f"={{{{ {STUDIO.replace(P, '$json')} }}}}/api/n8n/due?limit=10",
    "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth", "options": {"timeout": 20000}},
    [-60, 30], credentials=HEADER, retryOnFail=True, maxTries=2, waitBetweenTries=5000))
n2.append(node("Une publication", "n8n-nodes-base.splitOut", 1, {"fieldToSplitOut": "items", "options": {}}, [100, 30]))
n2.append(node("Quel réseau ?", "n8n-nodes-base.switch", 3.2, {"rules": {"values": [
    {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
                    "conditions": [{"leftValue": "={{ $json.network }}", "rightValue": net, "operator": {"type": "string", "operation": "equals"}}],
                    "combinator": "and"}, "renameOutput": True, "outputKey": label}
    for net, label in [("youtube", "YouTube"), ("linkedin", "LinkedIn"), ("tiktok", "TikTok"), ("instagram", "Instagram"), ("google", "Google"), ("facebook", "Facebook")]]},
    "options": {}}, [220, 30]))
for x, y in [("Réveil par le Studio (webhook)", "Attendre l'heure prévue"), ("Attendre l'heure prévue", "Mes paramètres"), ("Filet de sécurité (toutes les 2 h)", "Mes paramètres"),
             ("Mes paramètres", "Paramètres remplis ?"), ("Paramètres remplis ?", "Studio : à publier maintenant"),
             ("Studio : à publier maintenant", "Une publication"), ("Une publication", "Quel réseau ?")]:
    connect(c2, x, y)

def download(name, pos):
    return node(name, "n8n-nodes-base.httpRequest", 4.2, {"url": f"={{{{ {I}.media_url }}}}",
        "options": {"response": {"response": {"responseFormat": "file", "outputPropertyName": "data"}}, "timeout": 120000}},
        pos, retryOnFail=True, maxTries=2, waitBetweenTries=5000, onError="continueRegularOutput")

ERR = "const err = (j) => { if (!j) return 'Pas de réponse'; const e = j.error; if (!e) return null; if (typeof e === 'string') return e; return e.message || e.description || JSON.stringify(e).slice(0, 400); };\n"

def result(name, body, pos):
    code = ERR + "const t = $('Une publication').item.json;\nconst j = $json;\n" + body
    return node(name, "n8n-nodes-base.code", 2, {"mode": "runOnceForEachItem", "jsCode": code}, pos)

# ---------------- YouTube ----------------
y = 300
n2.append(download("YouTube : télécharger la vidéo", [480, -360]))
n2.append(node("YouTube : envoyer", "n8n-nodes-base.youTube", 1, {
    "resource": "video", "operation": "upload",
    "title": f"={{{{ {I}.title }}}}", "regionCode": "FR", "categoryId": "28", "binaryProperty": "data",
    "options": {"description": f"={{{{ {I}.text }}}}", "privacyStatus": f"={{{{ {P}.youtube_visibilite }}}}", "defaultLanguage": "fr", "selfDeclaredMadeForKids": False}},
    [720, -360], onError="continueRegularOutput", credentials={"youTubeOAuth2Api": {"id": "a-choisir", "name": "YouTube account"}}))
n2.append(result("Résultat YouTube",
    "const e = err(j);\nconst id = j.uploadId || j.id;\nif (e || !id) return { json: { target_id: t.target_id, status: 'erreur', error: 'YouTube : ' + (e || 'envoi refusé') } };\nreturn { json: { target_id: t.target_id, status: 'publie', external_id: id, url: 'https://youtu.be/' + id, is_private: $('Mes paramètres').first().json.youtube_visibilite !== 'public' } };",
    [960, -360]))
connect(c2, "Quel réseau ?", "YouTube : télécharger la vidéo", 0)
connect(c2, "YouTube : télécharger la vidéo", "YouTube : envoyer")
connect(c2, "YouTube : envoyer", "Résultat YouTube")

# ---------------- LinkedIn ----------------
n2.append(node("LinkedIn : avec image ?", "n8n-nodes-base.if", 2.2, {"conditions": {
    "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
    "conditions": [{"leftValue": "={{ $json.send_media && $json.media_type === 'image' }}", "rightValue": "", "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
    "combinator": "and"}, "options": {}}, [480, -160]))
n2.append(download("LinkedIn : télécharger l'image", [720, -220]))
li_common = {
    "postAs": f"={{{{ {I}.linkedin_mode === 'page' ? 'organization' : 'person' }}}}",
    "person": f"={{{{ {P}.linkedin_personne }}}}",
    "organization": f"={{{{ {P}.linkedin_page }}}}",
    "text": f"={{{{ {I}.text }}}}",
}
LI_CRED = {"linkedInOAuth2Api": {"id": "a-choisir", "name": "LinkedIn account"}}
n2.append(node("LinkedIn : publier avec image", "n8n-nodes-base.linkedIn", 1, {**li_common, "shareMediaCategory": "IMAGE", "binaryPropertyName": "data", "additionalFields": {"visibility": "PUBLIC"}},
    [960, -220], onError="continueRegularOutput", credentials=LI_CRED))
n2.append(node("LinkedIn : publier le texte", "n8n-nodes-base.linkedIn", 1, {**li_common, "shareMediaCategory": "NONE", "additionalFields": {"visibility": "PUBLIC"}},
    [960, -100], onError="continueRegularOutput", credentials=LI_CRED))
n2.append(result("Résultat LinkedIn",
    "const e = err(j);\nconst urn = j.urn || j.id || j['x-restli-id'];\nif (e) return { json: { target_id: t.target_id, status: 'erreur', error: 'LinkedIn : ' + e } };\nreturn { json: { target_id: t.target_id, status: 'publie', external_id: urn || null, url: urn ? 'https://www.linkedin.com/feed/update/' + urn : null } };",
    [1200, -160]))
connect(c2, "Quel réseau ?", "LinkedIn : avec image ?", 1)
connect(c2, "LinkedIn : avec image ?", "LinkedIn : télécharger l'image", 0)
connect(c2, "LinkedIn : avec image ?", "LinkedIn : publier le texte", 1)
connect(c2, "LinkedIn : télécharger l'image", "LinkedIn : publier avec image")
connect(c2, "LinkedIn : publier avec image", "Résultat LinkedIn")
connect(c2, "LinkedIn : publier le texte", "Résultat LinkedIn")

# ---------------- TikTok ----------------
n2.append(node("TikTok : jeton (Studio)", "n8n-nodes-base.httpRequest", 4.2, {
    "url": f"={{{{ {STUDIO} }}}}/api/n8n/tiktok-token",
    "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth", "options": {}},
    [480, 40], credentials=HEADER, onError="continueRegularOutput"))
n2.append(download("TikTok : télécharger la vidéo", [700, 40]))
TT_PREP = r"""// Prépare l'envoi direct (FILE_UPLOAD, un seul morceau : fichier ≤ 50 Mo).
const t = $('Une publication').item.json;
const tok = $('TikTok : jeton (Studio)').item.json;
if (!tok.access_token) return { json: { _stop: true, erreur: 'TikTok : ' + (tok.error?.message || tok.error || 'pas connecté (page Comptes du Studio)') } };
if (!$input.item.binary?.data) return { json: { _stop: true, erreur: 'TikTok : vidéo introuvable' } };
const buf = await this.helpers.getBinaryDataBuffer($itemIndex, 'data');
const size = buf.length;
const privacy = $('Mes paramètres').first().json.tiktok_confidentialite || 'SELF_ONLY';
return {
  json: {
    access_token: tok.access_token, size, privacy,
    init_body: {
      post_info: { title: String(t.text || '').slice(0, 2200), privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false },
      source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 },
    },
  },
  binary: $input.item.binary,
};"""
n2.append(node("TikTok : préparer", "n8n-nodes-base.code", 2, {"mode": "runOnceForEachItem", "jsCode": TT_PREP}, [920, 40]))
n2.append(node("TikTok : déclarer la vidéo", "n8n-nodes-base.httpRequest", 4.2, {
    "method": "POST", "url": "https://open.tiktokapis.com/v2/post/publish/video/init/",
    "sendHeaders": True, "headerParameters": {"parameters": [{"name": "Authorization", "value": "=Bearer {{ $json.access_token }}"}]},
    "sendBody": True, "specifyBody": "json", "jsonBody": "={{ JSON.stringify($json.init_body) }}", "options": {}},
    [1140, 40], onError="continueRegularOutput"))
TT_REATTACH = r"""// Remet la vidéo (le nœud précédent ne la transmet pas) et vérifie la réponse de TikTok.
const prep = $('TikTok : préparer').item;
if (prep.json._stop) return { json: { _stop: true, erreur: prep.json.erreur } };
const d = $json.data ?? {};
if (!d.upload_url) return { json: { _stop: true, erreur: 'TikTok : ' + ($json.error?.message || $json.error?.code || 'déclaration refusée') } };
return { json: { upload_url: d.upload_url, publish_id: d.publish_id, size: prep.json.size, access_token: prep.json.access_token, privacy: prep.json.privacy }, binary: prep.binary };"""
n2.append(node("TikTok : remettre la vidéo", "n8n-nodes-base.code", 2, {"mode": "runOnceForEachItem", "jsCode": TT_REATTACH}, [1360, 40]))
n2.append(node("TikTok : envoi possible ?", "n8n-nodes-base.if", 2.2, {"conditions": {
    "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
    "conditions": [{"leftValue": "={{ !$json._stop }}", "rightValue": "", "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
    "combinator": "and"}, "options": {}}, [1580, 40]))
n2.append(node("TikTok : envoyer la vidéo", "n8n-nodes-base.httpRequest", 4.2, {
    "method": "PUT", "url": "={{ $json.upload_url }}",
    "sendHeaders": True, "headerParameters": {"parameters": [
        {"name": "Content-Type", "value": "video/mp4"},
        {"name": "Content-Range", "value": "=bytes 0-{{ $json.size - 1 }}/{{ $json.size }}"}]},
    "sendBody": True, "contentType": "binaryData", "inputDataFieldName": "data", "options": {"timeout": 300000}},
    [1800, -20], onError="continueRegularOutput"))
n2.append(node("TikTok : attendre le traitement", "n8n-nodes-base.wait", 1.1, {"resume": "timeInterval", "amount": 30, "unit": "seconds"}, [2020, -20], webhookId=str(uuid.uuid5(uuid.NAMESPACE_DNS, "tiktok-wait"))))
n2.append(node("TikTok : état", "n8n-nodes-base.httpRequest", 4.2, {
    "method": "POST", "url": "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
    "sendHeaders": True, "headerParameters": {"parameters": [{"name": "Authorization", "value": "=Bearer {{ $('TikTok : remettre la vidéo').item.json.access_token }}"}]},
    "sendBody": True, "specifyBody": "json", "jsonBody": "={{ JSON.stringify({ publish_id: $('TikTok : remettre la vidéo').item.json.publish_id }) }}", "options": {}},
    [2240, -20], onError="continueRegularOutput"))
n2.append(result("Résultat TikTok",
    "if (j._stop) return { json: { target_id: t.target_id, status: 'erreur', error: j.erreur } };\n"
    "const up = $('TikTok : remettre la vidéo').item.json;\nconst s = j.data?.status;\n"
    "if (s === 'FAILED') return { json: { target_id: t.target_id, status: 'erreur', error: 'TikTok : ' + (j.data?.fail_reason || 'publication refusée') } };\n"
    "const postId = (j.data?.publicaly_available_post_id || [])[0];\n"
    "return { json: { target_id: t.target_id, status: 'publie', external_id: postId ? String(postId) : up.publish_id, url: postId ? 'https://www.tiktok.com/video/' + postId : null, is_private: up.privacy === 'SELF_ONLY' } };",
    [2460, 40]))
connect(c2, "Quel réseau ?", "TikTok : jeton (Studio)", 2)
connect(c2, "TikTok : jeton (Studio)", "TikTok : télécharger la vidéo")
connect(c2, "TikTok : télécharger la vidéo", "TikTok : préparer")
connect(c2, "TikTok : préparer", "TikTok : déclarer la vidéo")
connect(c2, "TikTok : déclarer la vidéo", "TikTok : remettre la vidéo")
connect(c2, "TikTok : remettre la vidéo", "TikTok : envoi possible ?")
connect(c2, "TikTok : envoi possible ?", "TikTok : envoyer la vidéo", 0)
connect(c2, "TikTok : envoi possible ?", "Résultat TikTok", 1)
connect(c2, "TikTok : envoyer la vidéo", "TikTok : attendre le traitement")
connect(c2, "TikTok : attendre le traitement", "TikTok : état")
connect(c2, "TikTok : état", "Résultat TikTok")

# ---------------- Instagram ----------------
FB = {"facebookGraphApi": {"id": "a-choisir", "name": "Facebook Graph account"}}
n2.append(node("Instagram : créer le média", "n8n-nodes-base.facebookGraphApi", 1.1, {
    "hostUrl": "graph.facebook.com", "httpRequestMethod": "POST", "graphApiVersion": "v21.0",
    "node": f"={{{{ {P}.instagram_compte_id }}}}", "edge": "media",
    "options": {"queryParametersJson": "={{ JSON.stringify($json.media_type === 'video' ? { media_type: 'REELS', video_url: $json.media_url, caption: $json.text, share_to_feed: true } : { image_url: $json.media_url, caption: $json.text }) }}"}},
    [480, 260], onError="continueRegularOutput", credentials=FB))
n2.append(node("Instagram : attendre", "n8n-nodes-base.wait", 1.1, {"resume": "timeInterval", "amount": 15, "unit": "seconds"}, [700, 260], webhookId=str(uuid.uuid5(uuid.NAMESPACE_DNS, "ig-wait"))))
n2.append(node("Instagram : état du média", "n8n-nodes-base.facebookGraphApi", 1.1, {
    "hostUrl": "graph.facebook.com", "httpRequestMethod": "GET", "graphApiVersion": "v21.0",
    "node": "={{ $('Instagram : créer le média').item.json.id }}",
    "options": {"fields": {"field": [{"name": "status_code"}]}}},
    [920, 260], onError="continueRegularOutput", credentials=FB))
n2.append(node("Instagram : prêt ?", "n8n-nodes-base.switch", 3.2, {"rules": {"values": [
    {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
        "conditions": [{"leftValue": "={{ !$('Instagram : créer le média').item.json.id || $json.error || $json.status_code === 'ERROR' || $json.status_code === 'EXPIRED' || ($json.status_code !== 'FINISHED' && $runIndex >= 20) }}", "rightValue": "", "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
        "combinator": "and"}, "renameOutput": True, "outputKey": "Échec"},
    {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
        "conditions": [{"leftValue": "={{ $json.status_code }}", "rightValue": "FINISHED", "operator": {"type": "string", "operation": "equals"}}],
        "combinator": "and"}, "renameOutput": True, "outputKey": "Prêt"},
    ]}, "options": {"fallbackOutput": "extra", "renameFallbackOutput": "Pas encore"}}, [1140, 260]))
n2.append(node("Instagram : publier", "n8n-nodes-base.facebookGraphApi", 1.1, {
    "hostUrl": "graph.facebook.com", "httpRequestMethod": "POST", "graphApiVersion": "v21.0",
    "node": f"={{{{ {P}.instagram_compte_id }}}}", "edge": "media_publish",
    "options": {"queryParameters": {"parameter": [{"name": "creation_id", "value": "={{ $('Instagram : créer le média').item.json.id }}"}]}}},
    [1360, 200], onError="continueRegularOutput", credentials=FB))
n2.append(node("Instagram : lien", "n8n-nodes-base.facebookGraphApi", 1.1, {
    "hostUrl": "graph.facebook.com", "httpRequestMethod": "GET", "graphApiVersion": "v21.0",
    "node": "={{ $json.id }}", "options": {"fields": {"field": [{"name": "permalink"}]}}},
    [1580, 200], onError="continueRegularOutput", credentials=FB))
n2.append(result("Résultat Instagram",
    "const created = $('Instagram : créer le média').item.json;\n"
    "if (!created.id) return { json: { target_id: t.target_id, status: 'erreur', error: 'Instagram : ' + (err(created) || 'média refusé') } };\n"
    "let pub = null; try { pub = $('Instagram : publier').item.json; } catch (x) { pub = null; }\n"
    "if (!pub || !pub.id) return { json: { target_id: t.target_id, status: 'erreur', error: 'Instagram : ' + (err(pub) || err(j) || ('média non prêt (' + (j.status_code || 'inconnu') + ')')) } };\n"
    "return { json: { target_id: t.target_id, status: 'publie', external_id: pub.id, url: j.permalink || null } };",
    [1800, 260]))
connect(c2, "Quel réseau ?", "Instagram : créer le média", 3)
connect(c2, "Instagram : créer le média", "Instagram : attendre")
connect(c2, "Instagram : attendre", "Instagram : état du média")
connect(c2, "Instagram : état du média", "Instagram : prêt ?")
connect(c2, "Instagram : prêt ?", "Résultat Instagram", 0)
connect(c2, "Instagram : prêt ?", "Instagram : publier", 1)
connect(c2, "Instagram : prêt ?", "Instagram : attendre", 2)
connect(c2, "Instagram : publier", "Instagram : lien")
connect(c2, "Instagram : lien", "Résultat Instagram")

# ---------------- Fiche Google ----------------
n2.append(node("Google : publier", "n8n-nodes-base.httpRequest", 4.2, {
    "method": "POST",
    "url": f"=https://mybusiness.googleapis.com/v4/{{{{ {P}.compte_google }}}}/{{{{ {P}.etablissement_google }}}}/localPosts",
    "authentication": "predefinedCredentialType", "nodeCredentialType": "googleBusinessProfileOAuth2Api",
    "sendBody": True, "specifyBody": "json",
    "jsonBody": f"={{{{ JSON.stringify(Object.assign({{ languageCode: 'fr', topicType: 'STANDARD', summary: $json.text, callToAction: {{ actionType: 'LEARN_MORE', url: {P}.site_web }} }}, $json.send_media && $json.media_type === 'image' ? {{ media: [{{ mediaFormat: 'PHOTO', sourceUrl: $json.media_url }}] }} : {{}})) }}}}",
    "options": {}},
    [480, 460], onError="continueRegularOutput", credentials={"googleBusinessProfileOAuth2Api": {"id": "a-choisir", "name": "Google Business Profile account"}}))
n2.append(result("Résultat Google",
    "const e = err(j);\nif (e || !j.name) return { json: { target_id: t.target_id, status: 'erreur', error: 'Fiche Google : ' + (e || 'publication refusée') } };\nreturn { json: { target_id: t.target_id, status: 'publie', external_id: j.name, url: j.searchUrl || null } };",
    [720, 460]))
connect(c2, "Quel réseau ?", "Google : publier", 4)
connect(c2, "Google : publier", "Résultat Google")

# ---------------- Page Facebook ----------------
n2.append(node("Facebook : vidéo ?", "n8n-nodes-base.if", 2.2, {"conditions": {
    "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
    "conditions": [{"leftValue": "={{ $json.send_media && $json.media_type === 'video' }}", "rightValue": "", "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
    "combinator": "and"}, "options": {}}, [480, 640]))
n2.append(node("Facebook : publier la vidéo", "n8n-nodes-base.facebookGraphApi", 1.1, {
    "hostUrl": "graph-video.facebook.com", "httpRequestMethod": "POST", "graphApiVersion": "v21.0",
    "node": f"={{{{ {P}.facebook_page_id }}}}", "edge": "videos",
    "options": {"queryParametersJson": "={{ JSON.stringify({ file_url: $json.media_url, description: $json.text }) }}"}},
    [720, 580], onError="continueRegularOutput", credentials=FB))
n2.append(node("Facebook : publier (texte ou photo)", "n8n-nodes-base.facebookGraphApi", 1.1, {
    "hostUrl": "graph.facebook.com", "httpRequestMethod": "POST", "graphApiVersion": "v21.0",
    "node": f"={{{{ {P}.facebook_page_id }}}}",
    "edge": "={{ $json.send_media && $json.media_type === 'image' ? 'photos' : 'feed' }}",
    "options": {"queryParametersJson": "={{ JSON.stringify($json.send_media && $json.media_type === 'image' ? { url: $json.media_url, caption: $json.text } : { message: $json.text }) }}"}},
    [720, 700], onError="continueRegularOutput", credentials=FB))
n2.append(result("Résultat Facebook",
    "const e = err(j);\nconst id = j.post_id || j.id;\nif (e || !id) return { json: { target_id: t.target_id, status: 'erreur', error: 'Facebook : ' + (e || 'publication refusée') } };\nreturn { json: { target_id: t.target_id, status: 'publie', external_id: String(id), url: 'https://www.facebook.com/' + id } };",
    [960, 640]))
connect(c2, "Quel réseau ?", "Facebook : vidéo ?", 5)
connect(c2, "Facebook : vidéo ?", "Facebook : publier la vidéo", 0)
connect(c2, "Facebook : vidéo ?", "Facebook : publier (texte ou photo)", 1)
connect(c2, "Facebook : publier la vidéo", "Résultat Facebook")
connect(c2, "Facebook : publier (texte ou photo)", "Résultat Facebook")

# ---------------- Retour au Studio ----------------
n2.append(node("Studio : noter le résultat", "n8n-nodes-base.httpRequest", 4.2, {
    "method": "PATCH", "url": f"={{{{ {STUDIO} }}}}/api/n8n/targets/{{{{ $json.target_id }}}}",
    "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
    "sendBody": True, "specifyBody": "json", "jsonBody": "={{ JSON.stringify($json) }}", "options": {}},
    [2700, 60], credentials=HEADER, retryOnFail=True, maxTries=3, waitBetweenTries=5000))
for r in ["Résultat YouTube", "Résultat LinkedIn", "Résultat TikTok", "Résultat Instagram", "Résultat Google", "Résultat Facebook"]:
    connect(c2, r, "Studio : noter le résultat")

wf2 = {"name": "Studio Réseaux — Publier", "nodes": n2, "connections": c2,
       "settings": {"executionOrder": "v1", "timezone": "Europe/Paris"}, "pinData": {}}

for fn, wf in [("studio-publier.json", wf2)]:
    names = {n["name"] for n in wf["nodes"]}
    for src, v in wf["connections"].items():
        assert src in names, src
        for outs in v["main"]:
            for d in outs: assert d["node"] in names, d["node"]
    json.dump(wf, open(f"{OUT}/{fn}", "w"), ensure_ascii=False, indent=2)
    print(fn, len(wf["nodes"]), "nœuds")
