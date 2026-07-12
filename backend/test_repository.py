from repository.scripture_repository import ScriptureRepository

repo = ScriptureRepository()

repo.load()

print(repo.get_verse("BG.02.047"))

print(repo.get_verse("ISHA.01.001"))