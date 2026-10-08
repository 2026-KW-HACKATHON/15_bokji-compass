"""Bounded Korean intent interpretation using the published catalog's vocabulary.

No member history, external model, web request or generated SQL is involved.
Concepts expand goals rather than guessing eligibility or hard-filtering a profile.
"""

import re
import unicodedata
from collections.abc import Iterable
from difflib import SequenceMatcher

from app.contracts.search import Correction, Institution, SearchPlan

CONCEPT_TERMS = {
    "scholarship": ("장학", "장학생", "학자금지원", "학비지원", "교육비지원"),
    "tuition": ("등록금", "학비", "학자금", "수업료", "장학", "교육비"),
    "rent": ("월세", "집세", "임차료", "임대료", "주거급여", "임차보증금"),
    "housing": ("주거", "주택", "전세", "보증금", "임대", "기숙사", "독립", "자취"),
    "living": ("생활비", "생계", "생활안정", "생활지원", "생계비", "긴급복지"),
    "financial": ("장학", "지원금", "보조금", "수당", "급여", "생활비", "대출", "학자금"),
    "employment": ("취업", "채용", "일자리", "구직", "직업", "인턴", "진로", "고용"),
    "training": ("직업훈련", "훈련", "교육", "자격증", "내일배움", "취업교육"),
    "care": ("돌봄", "간병", "요양", "보육", "방문지원", "활동지원"),
    "medical": ("의료", "진료", "치료", "병원", "건강", "검진", "약제비", "수술"),
    "loan": ("대출", "융자", "대여", "상환", "보증", "이자", "학자금대출"),
    "work": ("근로장학", "국가근로", "근로시간", "근로의무", "근로제공", "아르바이트",
             "시간제일자리", "일자리", "채용", "고용계약"),
    "business": ("창업", "사업", "소상공인", "자영업", "경영", "기업", "판로"),
    "farming": ("농업", "농림", "축산", "어업", "영농", "농어가", "농기계", "수산"),
    "disaster": ("재난", "재해", "수해", "침수", "피해복구", "산불", "복구지원"),
    "disability": ("장애", "활동지원", "보조기기", "재활"),
    "parenting": ("출산", "육아", "양육", "보육", "아동", "자녀", "아이돌봄"),
    "transport": ("교통", "통학", "통근", "대중교통", "버스", "지하철", "교통비"),
    "food": ("급식", "식비", "먹거리", "식사", "양곡", "쌀"),
    "energy": ("난방", "에너지", "전기요금", "가스요금", "연료비", "냉방"),
    "culture": ("문화", "예술", "체육", "문화누리", "여행", "공연", "스포츠"),
}
CONCEPT_LABELS = {
    "scholarship": "장학 지원", "tuition": "등록금·학비 지원", "rent": "월세 지원",
    "housing": "주거 지원", "living": "생활비 지원", "financial": "금전 지원",
    "employment": "취업·일자리", "training": "교육·훈련", "care": "돌봄 지원",
    "medical": "의료비 지원", "loan": "대출·융자", "work": "근로·일자리",
    "business": "사업·창업 지원", "farming": "농어업 지원", "disaster": "피해 복구 지원",
    "disability": "장애인 지원", "parenting": "자녀·양육 지원", "transport": "교통비 지원",
    "food": "식비 지원", "energy": "난방·에너지 지원", "culture": "문화·체육 지원",
}
QUERY_PATTERNS = {
    "scholarship": r"장학(?:금|생)?",
    "tuition": r"등록금|학비|학자금|수업료|교육비|대학비|학교다니는돈",
    "rent": r"월세|집세|방세|임차료|임대료",
    "housing": r"주거|주택|전세|보증금|기숙사|자취|독립|살집|집구하|방구하",
    "living": r"생활비|생계|먹고살|살림|생활힘|생활어려|생활빠듯|생활비없",
    "financial": (r"받을(?:만한|수있는)?돈|받는돈|돈받|돈(?:이)?없|지원금|보조금|"
                  r"수당|금전|돈좀|돈보태"),
    "employment": r"취업|채용|일자리|구직|인턴|직업|일구하|일찾",
    "training": r"직업훈련|훈련|자격증|내일배움|기술배우|배우고싶|배울수",
    "care": r"돌봄|간병|요양|돌봐|돌보|보살펴",
    "medical": r"병원|병원비|의료|진료|치료|검진|약값|수술|아파|아픈",
    "loan": r"대출|융자|빌릴|빌려|이자|빚|학자금대출",
    "work": r"근로장학|국가근로|알바|아르바이트",
    "business": r"창업|사업|소상공인|자영업|가게|장사|기업|경영",
    "farming": r"농업|농림|축산|어업|영농|농사|농어|농기계|수산",
    "disaster": r"재난|재해|수해|침수|피해|산불|물에잠|물난리|홍수|복구",
    "disability": r"장애|보조기기|재활",
    "parenting": r"출산|육아|양육|보육|아이|아동|자녀|우리애",
    "transport": r"교통|통학|통근|버스|지하철|차비",
    "food": r"급식|식비|먹을|먹거리|밥값|밥먹|쌀",
    "energy": r"난방|전기요금|가스요금|에너지|연료비|냉방|전기세|가스비",
    "culture": r"문화|예술|체육|여행|공연|스포츠",
}
AUDIENCE_PATTERNS = {
    "student": r"대학생|대학원생|재학생|학부생|학생|대생|학교다니|학교에다니",
    "young": r"청년|사회초년|취준|취업준비|20대|30대",
    "senior": r"어르신|노인|고령|시니어|할머니|할아버지|노후",
    "family": r"가족|가구|부모|자녀|아동|아이|한부모|우리애|우리엄마|우리아빠",
    "unemployed": r"백수|미취업|실직|구직|취준|취업준비",
    "disabled": r"장애|보조기기",
    "worker": r"회사다니|직장다니|재직|직장인|근로자",
}
AUDIENCE_LABELS = {"student": "학생", "young": "청년", "senior": "어르신", "family": "가족",
                   "unemployed": "구직자", "disabled": "장애인", "worker": "근로자"}
NEGATIVE = (r"(?:말고|제외|빼고|빼줘|싫|원치|원하지|필요없|안할|안하|"
            r"안해도|않아도|않는|않고|없는|없이|없었|없어야)")
FILLER = re.compile(
    r"(?:받을만한|받을만|관련된|찾아주라|찾아줘|찾아주세요|다니는데|다니는중|"
    r"좀|공고|정책|지원|혜택|관련|가능|필요|받을|받는|받고|신청|알려|찾아|찾을|찾고|보여|"
    r"있나|있어|있을|없나|없어|뭐가|뭐|어떤|어떻게|해줘|해주세요|주세|주는|도와|보태|"
    r"도움|너무|비싸|힘들|어렵|빠듯|궁금|방법|제도|해당|할수|수있는|수있|하는거|"
    r"할만|받을만|같은거|그런거|거없|좋겠|좋은|우리|저는|나는|제가|내가|저희|요$|"
    r"거$|것$|대상|올라온|올린|올리는|게시|올렸|하는|되는|지금|현재|최근|"
    r"싶어|싶은|싶다|중에|가운데|한테|인데|는데|주라|이나|낼|내는)"
)


def normalized(value: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", value).casefold())


def institution_aliases(name: str) -> tuple[str, ...]:
    name = normalized(name)
    aliases = [name]
    match = re.fullmatch(r"([가-힣]{2,})대학교", name)
    if match:
        aliases.append(match[1] + "대")
    elif re.fullmatch(r"[가-힣]{2,}대", name):
        aliases.append(name[:-1] + "대학교")
    # Conventional English university names are explicit, conservative aliases.
    if name == "광운대학교":
        aliases.extend(("kwangwoon", "kwangwoonuniversity"))
    return tuple(dict.fromkeys(aliases))


def _entities(query: str, vocabulary: Iterable[str]):
    names = sorted({name.strip() for name in vocabulary if isinstance(name, str) and name.strip()},
                   key=lambda name: (-len(normalized(name)), name))
    compact = normalized(query)
    found, corrections, occupied = [], [], []
    for name in names:
        aliases = institution_aliases(name)
        hits = [(compact.find(alias), alias) for alias in aliases if alias in compact]
        if not hits:
            continue
        start, alias = min(hits, key=lambda hit: (-len(hit[1]), hit[0]))
        end = start + len(alias)
        if any(start < right and end > left for left, right in occupied):
            continue
        occupied.append((start, end))
        found.append((name, aliases, alias))
    # Resolve typos against actual catalog names; competing near-ties stay unresolved.
    for token in re.findall(r"[가-힣A-Za-z]{3,}", query):
        prefix = re.match(r"(.+?대학교|[가-힣]{2,}?[대데])(?:에서|생|학생|가|는|의|$)", token)
        if prefix:
            token = prefix[1]
        token = re.sub(r"(?:에서|으로|에게|은|는|이|가|을|를|의|에|도)$", "", token)
        if not token or any(normalized(token) in aliases for _, aliases, _ in found):
            continue
        if len(token) > 12 or not token.endswith(("대", "데", "대학교")):
            continue
        choices = []
        for name in names:
            aliases = institution_aliases(name)
            ratio = max(SequenceMatcher(None, unicodedata.normalize("NFD", normalized(token)),
                                       unicodedata.normalize("NFD", alias)).ratio()
                        for alias in aliases)
            if ratio >= 0.8:
                choices.append((ratio, name, aliases))
        choices.sort(key=lambda item: (-item[0], item[1]))
        if choices and (len(choices) == 1 or choices[0][0] - choices[1][0] >= 0.08):
            _, name, aliases = choices[0]
            if not any(existing == name for existing, _, _ in found):
                found.append((name, aliases, normalized(token)))
                corrections.append(Correction(token, name))
    return found, corrections


def _unverified_affiliations(query: str, entities):
    """Keep an explicit school context even without school-specific sources.

    The user's supplied school name is a search constraint, not a verified
    institution identity. Nationwide student evidence can still answer it.
    """
    added = []
    # Do not join a preceding description to generic "대학생":
    # "말고 대학생" must never create a school named "말고대".
    pattern = r"([가-힣A-Za-z]{2,16}대(?:학교)?)\s*(?:생|학생|재학|(?:에\s*)?다니)"
    for match in re.finditer(pattern, unicodedata.normalize("NFKC", query)):
        name = re.sub(r"\s+", "", match[1])
        stem = re.sub(r"(?:대학교|대)$", "", name)
        if not _residual_terms(stem, (), _exclusions(normalized(stem))):
            continue
        if any(normalized(name).endswith(alias) for _, aliases, original in (*entities, *added)
               for alias in (*aliases, original)):
            continue
        added.append((name, institution_aliases(name), normalized(name)))
    return added


def _exclusions(text: str) -> tuple[str, ...]:
    work = r"(?:알바|아르바이트|근로(?:장학(?:금)?)?|일(?:을|해야|하는)|노동)"
    loans = r"(?:대출|융자|상환|갚(?:는|아야|아|기)?|돌려(?:줘야|주어야|주는|줘))"
    patterns = {"work": work, "loan": loans}
    patterns.update((concept, QUERY_PATTERNS[concept]) for concept in (
        "employment", "housing", "rent", "scholarship", "medical", "business"))
    result = []
    # Bind each negative cue to the nearest concept, rather than crossing a
    # positive neighbor: "장학금 대출 말고" excludes loans, not scholarships.
    for clause in re.split(r"[,.。!?;]", text):
        mentions = [(match.start(), match.end(), concept)
                    for concept, pattern in patterns.items()
                    for match in re.finditer(pattern, clause)]
        for negative in re.finditer(NEGATIVE, clause):
            preceding = [mention for mention in mentions
                         if 0 <= negative.start() - mention[1] <= 24]
            preceding.sort(key=lambda mention: (-mention[1], mention[0]))
            if not preceding:
                continue
            selected = preceding[0]
            result.append(selected[2])
            # Coordinated exclusions share the cue: "대출이나 알바 말고".
            for previous in preceding[1:]:
                between = clause[previous[1]:selected[0]]
                if previous[1] > selected[0] or not re.fullmatch(
                        r"(?:이나|나|와|과|랑|하고|또는|및)+", between):
                    continue
                result.append(previous[2])
                selected = previous
        for concept, pattern in (("work", work), ("loan", loans)):
            if re.search(r"(?:안|않고|없이|없어야)[^,.。!?;]{0,6}" + pattern, clause):
                result.append(concept)
    if re.search(r"(?:안갚|상환없는|비상환|무상지원)", text):
        result.append("loan")
    if re.search(r"일(?:을)?(?:안(?:하|해)|하지않)", text):
        result.append("work")
    return tuple(dict.fromkeys(result))


def _erase_compact_matches(value: str, pattern: str) -> str:
    """Erase recognized phrases while preserving boundaries of unknown nouns."""
    indices = [index for index, character in enumerate(value) if not character.isspace()]
    compact = "".join(value[index] for index in indices)
    characters = list(value)
    for match in re.finditer(pattern, compact):
        for index in indices[match.start():match.end()]:
            characters[index] = " "
    return "".join(characters)


def _institution_role(entity, text: str, default: str, *, multiple: bool) -> str:
    name, aliases, _ = entity
    roles = []
    for alias in sorted(aliases, key=len, reverse=True):
        for hit in re.finditer(re.escape(alias), text):
            after = text[hit.end():hit.end() + 30]
            if re.match(r"^(?:공고)?(?:은|는|이|가)?(?:말고|제외|빼고|아니)", after):
                roles.append("excluded")
            elif re.match(r"^(?:에서|가|이)(?:올린|올라온|올리는|올렸|게시|등록한|낸)|"
                          r"^공고(?:중|가운데)|^(?:공지|게시판)", after):
                roles.append("publisher")
            elif name.endswith(("대", "대학교", "대학")) and re.match(
                    r"^(?:의|에|에서)?(?:재학|소속|학생|학부생|대학원생|생|다니)", after):
                roles.append("affiliation")
    # A later explicit positive occurrence can refine an earlier alternative:
    # "광운대 공고 말고 광운대 학생 대상" remains a student request.
    if "affiliation" in roles:
        return "affiliation"
    if "publisher" in roles:
        return "publisher"
    if "excluded" in roles:
        return "excluded"
    return "related" if multiple else default


def _institutions(entities, text: str, default: str) -> tuple[Institution, ...]:
    parsed = [Institution(entity[0], entity[1], _institution_role(
        entity, text, default, multiple=len(entities) > 1)) for entity in entities]
    positions = []
    for index, entity in enumerate(parsed):
        hits = [(match.start(), match.end(), index) for alias in entity.aliases
                for match in re.finditer(re.escape(alias), text)]
        if hits:
            positions.append(min(hits, key=lambda hit: (hit[0], -hit[1])))
    positions.sort()
    # Shared trailing modifiers apply across a coordinated list, e.g.
    # "광운대나 서강대 학생" and "광운대와 서강대 말고 국민대".
    for current, following in reversed(list(zip(positions, positions[1:]))):
        left, right = parsed[current[2]], parsed[following[2]]
        connector = text[current[1]:following[0]]
        if left.role != "related" or not re.fullmatch(r"(?:나|이나|와|과|랑|또는|하고|및)*",
                                                      connector):
            continue
        if right.role == "affiliation" and not left.name.endswith(("대", "대학교", "대학")):
            continue
        parsed[current[2]] = Institution(left.name, left.aliases, right.role)
    return tuple(parsed)


def _residual_terms(query: str, entities, exclusions) -> tuple[str, ...]:
    cleaned = unicodedata.normalize("NFKC", query).casefold()
    for _, aliases, original in entities:
        for alias in sorted((*aliases, original), key=len, reverse=True):
            cleaned = re.sub(r"\s*".join(re.escape(char) for char in alias), " ", cleaned)
    # Redundant money cues remain interpreted even when a more specific goal
    # replaces them in the plan; they must not become literal constraints.
    for pattern in QUERY_PATTERNS.values():
        cleaned = _erase_compact_matches(cleaned, pattern)
    for pattern in AUDIENCE_PATTERNS.values():
        cleaned = _erase_compact_matches(cleaned, pattern)
    cleaned = re.sub(r"우리(?:학교|대학)|본교|내학교", " ", cleaned)
    if "loan" in exclusions:
        cleaned = re.sub(r"갚[^\s,.。!?;]*|돌려[^\s,.。!?;]*|상환[^\s,.。!?;]*", " ", cleaned)
    if "work" in exclusions:
        cleaned = re.sub(r"근로(?:장학(?:금)?)?|일(?:을|해야|하는)|노동", " ", cleaned)
        cleaned = _erase_compact_matches(cleaned, r"일(?:을)?(?:안(?:하고|해도|하는)|하지않아도)")
    cleaned = re.sub(r"(?:말고|제외|빼고|빼줘|싫어|싫은|안하는|안해도|않아도|않는|않고|"
                     r"없이|없어야)", " ", cleaned)
    cleaned = FILLER.sub(" ", cleaned)
    terms = []
    for word in re.findall(r"[가-힣A-Za-z0-9_%/]+", cleaned):
        word = re.sub(r"(?:에서|으로|에게|은|는|을|를|의|에|도|좀)$", "", word)
        if len(word) >= 2 or word in {"%", "_"}:
            terms.append(word)
    return tuple(dict.fromkeys(terms))[:12]


def interpret_query(query: str, institutions: Iterable[str] = ()) -> SearchPlan:
    if not isinstance(query, str) or len(query) > 200:
        raise ValueError("Search query must be text with at most 200 characters")
    query = query.strip()
    compact = normalized(query)
    entities, corrections = _entities(query, institutions)
    unverified = _unverified_affiliations(query, entities)
    entities.extend(unverified)
    for correction in corrections:
        compact = compact.replace(normalized(correction.original),
                                  normalized(correction.replacement))
    exclusions = _exclusions(compact)
    concepts = [name for name, pattern in QUERY_PATTERNS.items()
                if re.search(pattern, compact) and name not in exclusions]
    if "financial" in concepts and any(concept in concepts for concept in (
            "tuition", "rent", "living", "medical", "food", "energy", "transport", "parenting")):
        concepts.remove("financial")
    if "rent" in concepts and "housing" in concepts:
        concepts.remove("housing")
    audiences = [name for name, pattern in AUDIENCE_PATTERNS.items() if re.search(pattern, compact)]
    publisher = bool(re.search(r"(?:에서|가|이)(?:올린|올라온|올리는|올렸|게시|등록한|낸)|게시기관|"
                               r"학교(?:공지|게시판)|대(?:공지|게시판)|대(?:학교)?공고(?:중|가운데)",
                               compact))
    publisher_negated = bool(re.search(
        r"(?:공고|게시|올린)[^,.。!?;]{0,5}(?:말고|아니|제외)", compact))
    student = "student" in audiences or bool(re.search(r"대(?:학교)?(?:생|학생)", compact))
    target = bool(re.search(
        r"학생(?:대상|이|에게|한테|을위|지원)|대생|재학|소속|받을수|신청할수|대(?:학교)?다니",
        compact))
    intent = ("publisher" if publisher and not publisher_negated else
              "target" if entities and (target or student) else
              "related" if entities and concepts else
              "ambiguous" if entities else "general")
    if entities and intent == "target" and "student" not in audiences:
        audiences.append("student")
    role = ("publisher" if intent == "publisher" else
            "affiliation" if intent == "target" else "related")
    institutions_parsed = _institutions(entities, compact, role)
    ambiguities = []
    if unverified:
        ambiguities.append("입력한 학교 이름이 공개 공고에서 확인되지 않아, "
                           "학교를 특정하지 않은 전국 대학생 안내도 함께 찾았어요.")
    if re.search(r"우리(?:학교|대학)|본교|내학교", compact) and not institutions_parsed:
        ambiguities.append("학교가 확인되지 않아 일반 학생 지원도 함께 찾았어요.")
        if "student" not in audiences:
            audiences.append("student")
    if intent == "ambiguous":
        ambiguities.append("기관이 올린 공고와 직접 관련된 공고를 함께 찾았어요.")
    terms = _residual_terms(query, entities, exclusions)
    if query and not (institutions_parsed or concepts or terms or audiences or exclusions):
        terms = (query,)
    institution_text = " · ".join(entity.name for entity in institutions_parsed
                                  if entity.role != "excluded")
    publishers = " · ".join(entity.name for entity in institutions_parsed
                            if entity.role == "publisher")
    affiliations = " · ".join(entity.name for entity in institutions_parsed
                              if entity.role == "affiliation")
    goal = " · ".join(CONCEPT_LABELS[concept] for concept in concepts[:3])
    if publishers and affiliations:
        summary = f"게시기관: {publishers}. {affiliations} 학생 관련 공고를 찾았어요."
    elif intent == "publisher":
        summary = f"게시기관: {institution_text}. 지원 목적: {goal or '전체 공고'}."
    elif intent == "target":
        summary = f"{institution_text} 학생 관련 {goal or '지원'}으로 이해했어요."
    elif institution_text:
        summary = f"{institution_text} 관련 공고를 찾았어요."
    elif goal:
        summary = f"{goal} 관련 공고를 찾았어요."
    else:
        summary = "입력한 표현과 공고의 내용을 함께 살펴봤어요."
    if exclusions:
        excluded = " · ".join(CONCEPT_LABELS.get(item, item) for item in exclusions)
        summary += f" 제외 조건: {excluded}."
    excluded_schools = " · ".join(entity.name for entity in institutions_parsed
                                 if entity.role == "excluded")
    if excluded_schools:
        summary += f" 제외 기관: {excluded_schools}."
    interpreted = " ".join(filter(None, (institution_text, goal, " ".join(terms)))) or query
    return SearchPlan(query, interpreted, intent, institutions_parsed, tuple(concepts), exclusions,
                      terms, tuple(audiences), tuple(corrections), tuple(ambiguities), summary)
