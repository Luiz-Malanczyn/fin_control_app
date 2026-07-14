import secrets
import string

_ALPHABET = "".join(c for c in string.ascii_uppercase + string.digits if c not in "0O1I")


def new_invite_code() -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(8))
