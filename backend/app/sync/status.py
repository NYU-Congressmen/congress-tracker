def status_from_action(action_type: str | None, text: str | None) -> str:
    # Return the bill status one action shows, checking the furthest stage first.
    text = (text or "").lower()
    action_type = action_type or ""
    if action_type == "BecameLaw" or "became public law" in text:
        return "became_law"
    elif "presented to president" in text:
        return "to_president"
    elif "passed/agreed to in senate" in text or "received in the house" in text:
        return "passed_senate"
    elif "passed/agreed to in house" in text or "received in the senate" in text:
        return "passed_house"
    elif action_type == "Committee" or "referred to" in text or "committee" in text:
        return "committee"
    return "introduced"
